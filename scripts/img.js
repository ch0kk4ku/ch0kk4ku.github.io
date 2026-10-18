/**
 * 图片处理：压缩 + 去元数据（EXIF），用于往博客里加图。
 *
 * 用法：
 *   pnpm img <文件或目录>... [选项]
 *
 * 选项：
 *   --slug=<文章slug>    输出到 public/assets/images/posts/<slug>/
 *                        （不指定则输出到 public/assets/images/uploads/）
 *   --out=<目录>         自定义输出目录（相对仓库根）
 *   --type=shot|photo    压缩策略：shot（截图，尽量无损）/ photo（照片，有损）
 *                        默认按扩展名猜：png→shot，jpg/jpeg→photo
 *   --max-width=1600     宽度上限
 *   --max-kb=300         单张体积上限
 *   --keep-names         保留原文件名（默认加 01- 序号）
 *   --dry-run            只打印，不写文件
 *
 * 说明：
 *   - 所有输出都会**剥掉 EXIF**（GPS、设备型号、拍摄时间），避免泄露行踪
 *   - 截图默认「无损 WebP / PNG 调色板 / PNG 常规 / 原图」取最小
 *   - 照片默认有损 WebP，超体积逐档降质量
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { slugifySegment } from "./lib/slug.js";

const argv = process.argv.slice(2);
const flags = new Map();
const inputs = [];
for (let i = 0; i < argv.length; i += 1) {
	const arg = argv[i];
	if (arg.startsWith("--")) {
		const [key, ...rest] = arg.slice(2).split("=");
		const value =
			rest.length > 0
				? rest.join("=")
				: argv[i + 1] && !argv[i + 1].startsWith("--")
					? argv[++i]
					: "";
		flags.set(key, value);
	} else {
		inputs.push(arg);
	}
}

if (inputs.length === 0) {
	console.error(
		"用法: pnpm img <文件或目录>... [--slug=文章slug] [--out=目录] [--type=shot|photo] [--max-width=1600] [--max-kb=300]",
	);
	process.exit(1);
}

const dryRun = flags.has("dry-run");
const maxWidth = Number(flags.get("max-width")) || 1600;
const maxKb = Number(flags.get("max-kb")) || 300;
const keepNames = flags.has("keep-names");

const slug = flags.get("slug");
const outDirRel = flags.get("out")
	? flags.get("out")
	: slug
		? `public/assets/images/posts/${slug}`
		: "public/assets/images/uploads";
const outDirAbs = path.resolve(outDirRel);

const IMAGE_EXT = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".avif",
	".gif",
	".bmp",
]);

/** 展开输入：目录递归取图片，保持稳定排序 */
function expand(list) {
	const out = [];
	for (const item of list) {
		const abs = path.resolve(item);
		if (!fs.existsSync(abs)) {
			console.warn(`  ⚠ 跳过（不存在）：${item}`);
			continue;
		}
		const st = fs.statSync(abs);
		if (st.isDirectory()) {
			const files = fs
				.readdirSync(abs)
				.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
				.sort();
			for (const f of files) out.push(path.join(abs, f));
		} else if (IMAGE_EXT.has(path.extname(abs).toLowerCase())) {
			out.push(abs);
		} else {
			console.warn(`  ⚠ 跳过（不是图片）：${item}`);
		}
	}
	return out;
}

/** 按策略压缩；返回值带 mode 说明与是否剥了元数据 */
async function compress(file, type) {
	const buf = fs.readFileSync(file);
	const meta = await sharp(buf).metadata();
	const srcW = meta.width ?? 0;
	const srcH = meta.height ?? 0;
	const ext = path.extname(file).slice(1).toLowerCase();
	const hasExif = Boolean(meta.exif);

	// GIF/SVG 等不重编码（会丢动画/矢量）
	if (ext === "gif" || (meta.pages ?? 1) > 1) {
		return {
			buffer: buf,
			ext,
			srcW,
			srcH,
			outW: srcW,
			outH: srcH,
			srcBytes: buf.length,
			mode: "原样（动图）",
			exif: hasExif ? "未剥离（避免破坏动画）" : "无",
		};
	}

	const scaleTo = (width) => {
		let p = sharp(buf).rotate(); // rotate() 会应用 EXIF 方向，随后元数据不会写回
		if (srcW > width) p = p.resize({ width });
		return p;
	};

	const encodePhoto = (width, quality) =>
		scaleTo(width).webp({ quality, effort: 6 }).toBuffer();

	const encodeShot = async (width) => {
		const webp = await scaleTo(width)
			.webp({ lossless: true, effort: 6 })
			.toBuffer();
		const pngPalette = await scaleTo(width)
			.png({ compressionLevel: 9, palette: true, quality: 90 })
			.toBuffer();
		const candidates = [
			{ buffer: webp, ext: "webp", mode: "无损 WebP" },
			{ buffer: pngPalette, ext: "png", mode: "PNG 调色板" },
		];
		if (ext === "png" || ext === "jpeg" || ext === "jpg") {
			const pngPlain = await scaleTo(width)
				.png({ compressionLevel: 9 })
				.toBuffer();
			candidates.push({ buffer: pngPlain, ext: "png", mode: "PNG 常规" });
		}
		if (srcW > 0 && srcW <= width) {
			candidates.push({ buffer: buf, ext, mode: "保持原图" });
		}
		candidates.sort((a, b) => a.buffer.length - b.buffer.length);
		if (candidates[0].buffer.length > buf.length) {
			return { buffer: buf, ext, mode: "保持原图（重编码更大）" };
		}
		return candidates[0];
	};

	let width = srcW > 0 ? Math.min(srcW, maxWidth) : maxWidth;
	const limit = maxKb * 1024;

	let picked;
	if (type === "shot") {
		picked = await encodeShot(width);
		if (picked.buffer.length > limit) {
			const w2 = Math.min(width, 1280);
			for (const q of [92, 85, 78]) {
				const out = await encodePhoto(w2, q);
				picked = { buffer: out, ext: "webp", mode: `有损 q${q}` };
				width = w2;
				if (out.length <= limit) break;
			}
		}
	} else {
		let quality = 82;
		picked = {
			buffer: await encodePhoto(width, quality),
			ext: "webp",
			mode: "有损 q82",
		};
		while (picked.buffer.length > limit && quality > 48) {
			quality -= 8;
			picked = {
				buffer: await encodePhoto(width, quality),
				ext: "webp",
				mode: `有损 q${quality}`,
			};
		}
	}

	const outMeta = await sharp(picked.buffer).metadata();
	return {
		buffer: picked.buffer,
		ext: picked.ext,
		srcW,
		srcH,
		outW: outMeta.width ?? srcW,
		outH: outMeta.height ?? srcH,
		srcBytes: buf.length,
		mode: picked.mode,
		exif: hasExif ? "已剥离" : "无",
	};
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const files = expand(inputs);
if (files.length === 0) {
	console.error("没有可处理的图片。");
	process.exit(1);
}

console.log(`输出目录：${outDirRel}`);
console.log(
	`策略    ：--type=${flags.get("type") ?? "按扩展名自动"}  宽度≤${maxWidth}  体积≤${maxKb} KB\n`,
);

if (!dryRun) fs.mkdirSync(outDirAbs, { recursive: true });

let index = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
	index += 1;
	const type =
		flags.get("type") ||
		([".jpg", ".jpeg"].includes(path.extname(file).toLowerCase())
			? "photo"
			: "shot");

	const info = await compress(file, type);
	const base = path.basename(file, path.extname(file));
	const safe = slugifySegment(base).slice(0, 40) || `image-${index}`;
	const fileName = keepNames
		? `${base}.${info.ext}`
		: `${String(index).padStart(2, "0")}-${safe}.${info.ext}`;

	if (!dryRun) {
		fs.writeFileSync(path.join(outDirAbs, fileName), info.buffer);
	}

	totalBefore += info.srcBytes;
	totalAfter += info.buffer.length;
	console.log(
		`  ${fileName}  ${info.srcW}×${info.srcH} ${(info.srcBytes / 1024).toFixed(0)} KB → ${info.outW}×${info.outH} ${(info.buffer.length / 1024).toFixed(0)} KB（${info.mode}，EXIF ${info.exif}）`,
	);
}

console.log(
	`\n合计：${(totalBefore / 1024).toFixed(1)} KB → ${(totalAfter / 1024).toFixed(1)} KB，共 ${files.length} 张`,
);
if (dryRun) console.log("[dry-run] 未写入任何文件。");
else {
	console.log(`\n已写入 ${outDirRel}/`);
	console.log(
		slug
			? `正文里这样引用：![](/${outDirRel.replace(/^public\//, "")}/<上面的文件名>)`
			: "记得在正文里用 /assets/images/... 的形式引用这些图（或者用 import-post 自动处理）。",
	);
}
