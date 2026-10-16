/**
 * 友链维护工具（交互式）
 *
 * 用法：
 *   pnpm friend            交互式添加一条友链
 *   pnpm friend:list       列出当前所有友链
 *   pnpm friend:edit       交互式编辑某条友链（回车 = 保持原值）
 *   pnpm friend:remove     交互式移除一条友链
 *
 * 编辑也可以用纯参数（不会发问，只改显式给出的字段）：
 *   pnpm friend:edit --index=2 --title="新名字" --url="https://new.example"
 *   pnpm friend:edit --index=2 --img="D:\pics\new.png"   # 换头像，自动裁方自托管
 *   pnpm friend:edit --index=2 --remove-image            # 清空头像
 *   pnpm friend:edit --index=2 --disable                 # 停用（卡片不再显示）
 *
 * 它只做一件事：把你填的信息追加进 src/config/friendsConfig.ts 的 friendsConfig 数组，
 * 不需要你手写 TypeScript 对象，也不会碰文件里的其它内容。
 *
 * 头像图片（本项目采用「自托管」，默认按中间裁成正方形）：
 *   支持三种输入：本地图片文件、远程 URL、/ 开头的站内路径。
 *   博客园、微博、B 站等图床校验 Referer，页面直接引用远程图片会 403，
 *   所以远程 URL 会由脚本自己取回来，和本地文件一样裁方后存到本地：
 *
 *     pnpm friend --title="朋友的博客" --url="https://friend.com" --img="https://friend.com/a.png"
 *     pnpm friend --title="朋友的博客" --url="https://friend.com" --img="D:\pics\avatar.jpg"
 *       -> 都存到 public/friends/朋友的博客.png，配置里写成 /friends/朋友的博客.png
 *
 *   可选参数：
 *     --no-crop      不裁剪，保留原始比例
 *     --embed        小图（<=256 KB）转成 data URI 内嵌进配置
 *     --no-download  远程 URL 不做处理，保留原始地址
 */
import fs from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { slugifySegment } from "./lib/slug.js";

const CONFIG_PATH = path.resolve("src/config/friendsConfig.ts");
const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const ARRAY_START = "export const friendsConfig: FriendLink[] = [";

// ---------------------------------------------------------------------------
// 读取与解析
// ---------------------------------------------------------------------------

function readConfig() {
	if (!fs.existsSync(CONFIG_PATH)) {
		console.error(`找不到配置文件：${CONFIG_PATH}`);
		process.exit(1);
	}
	return fs.readFileSync(CONFIG_PATH, "utf8");
}

/** 找到 friendsConfig 数组的内容区间 [start, end) */
function arrayBounds(text) {
	const start = text.indexOf(ARRAY_START);
	if (start === -1) {
		console.error("在 friendsConfig.ts 中找不到 friendsConfig 数组声明。");
		process.exit(1);
	}
	const bodyStart = start + ARRAY_START.length;
	let depth = 1;
	let i = bodyStart;
	let inString = null;
	let inLineComment = false;
	let inBlockComment = false;
	while (i < text.length) {
		const ch = text[i];
		const next = text[i + 1];
		if (inLineComment) {
			if (ch === "\n") inLineComment = false;
		} else if (inBlockComment) {
			if (ch === "*" && next === "/") {
				inBlockComment = false;
				i += 1;
			}
		} else if (inString) {
			if (ch === "\\") i += 1;
			else if (ch === inString) inString = null;
		} else if (ch === '"' || ch === "'" || ch === "`") {
			inString = ch;
		} else if (ch === "/" && next === "/") {
			inLineComment = true;
			i += 1;
		} else if (ch === "/" && next === "*") {
			inBlockComment = true;
			i += 1;
		} else if (ch === "[") {
			depth += 1;
		} else if (ch === "]") {
			depth -= 1;
			if (depth === 0) return { bodyStart, bodyEnd: i };
		}
		i += 1;
	}
	console.error("friendsConfig 数组没有正确闭合。");
	process.exit(1);
}

/** 从数组文本里提取出已有的友链条目（按 title 粗略识别） */
function parseEntries(body) {
	const entries = [];
	const re = /\{\s*title:\s*"((?:[^"\\]|\\.)*)"/g;
	for (const match of body.matchAll(re)) {
		entries.push(match[1]);
	}
	return entries;
}

// ---------------------------------------------------------------------------
// 生成与写入
// ---------------------------------------------------------------------------

/** 转义成 TypeScript 双引号字符串里的内容（不要叫 escape，那是全局函数） */
const escapeForTs = (value) =>
	String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// ---------------------------------------------------------------------------
// 头像处理：本地文件 / 远程图片 -> 裁成正方形 -> 自托管到 public/friends/
// ---------------------------------------------------------------------------
//
// 支持的输入（--img 或交互式填写）：
//   1. 本地图片文件：Windows 路径（D:\pic\a.png）、相对路径（./a.png / pic/a.png）、file:// URL
//   2. 远程 URL     ：自动下载（不带 Referer，绕开博客园等图床的防盗链）
//   3. / 开头的站内路径、data: URI：原样保留，不做处理
//
// 处理规则：
//   · 默认按「中间裁剪」成正方形（取短边，position: centre），与卡片显示形状一致
//   · --no-crop    保留原始比例，只做拷贝/下载
//   · --embed      小图（<=256 KB）转成 data URI 内嵌进配置，否则仍自托管
//   · --no-download 远程 URL 不做处理，原样保留
//   · SVG 与动图（GIF/APNG）不裁剪、不重编码，原样拷贝，避免毁掉矢量与动画
//   · JPEG 输出会去掉 alpha（避免出现粉边），其他格式保留透明通道

const FRIENDS_PUBLIC_DIR = path.resolve("public/friends");
const EMBED_SIZE_LIMIT = 256 * 1024; // 超过这个大小就不建议内嵌
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const MIME_BY_EXT = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	bmp: "image/bmp",
};

const EXT_BY_MIME = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
	"image/svg+xml": "svg",
	"image/x-icon": "ico",
	"image/vnd.microsoft.icon": "ico",
	"image/bmp": "bmp",
};

// 不经 sharp 重编码、直接原样存盘的格式
const PASSTHROUGH_MIME = new Set(["image/svg+xml", "image/gif"]);

/** 生成 public/friends/ 下的文件名（按站点名转拼音） */
function safeFileName(title, ext) {
	const base = slugifySegment(title) || "friend";
	return `${base}.${ext}`;
}

/** 判断是否为本地文件输入，返回绝对路径（不是则返回 null） */
function resolveLocalFile(value) {
	let candidate = value;
	if (/^file:\/\//i.test(value)) {
		try {
			candidate = fileURLToPath(value);
		} catch {
			return null;
		}
	}
	const attempts = [candidate];
	if (!path.isAbsolute(candidate)) {
		attempts.push(path.resolve(candidate), path.resolve(REPO_ROOT, candidate));
	}
	for (const p of attempts) {
		try {
			if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
		} catch {
			// 忽略无权限等异常，继续尝试下一个
		}
	}
	return null;
}

/**
 * 按需裁成正方形（居中，取短边），并保持原格式返回。
 * @returns {Promise<{buffer: Buffer, format: string, mime: string, cropped: boolean, note: string}>}
 */
async function toSquareBuffer(input, { crop }) {
	const isBuffer = Buffer.isBuffer(input);
	const meta = await sharp(
		input,
		isBuffer ? {} : { failOn: "none" },
	).metadata();
	const format = (meta.format ?? "png").toLowerCase();
	const width = meta.width ?? 0;
	const height = meta.height ?? 0;
	const pages = meta.pages ?? 1;
	const mime =
		format === "jpg" || format === "jpeg"
			? "image/jpeg"
			: (MIME_BY_EXT[format] ?? "image/png");

	// 矢量与动图原样返回，避免破坏
	if (PASSTHROUGH_MIME.has(mime) || pages > 1) {
		const reason = mime === "image/svg+xml" ? "SVG" : "动图";
		const buffer = isBuffer ? input : fs.readFileSync(input);
		return {
			buffer,
			format,
			mime,
			cropped: false,
			note: `${reason}不裁剪，原样保存（${width}×${height}）`,
		};
	}

	if (!crop || width === 0 || height === 0 || width === height) {
		const buffer = isBuffer ? input : fs.readFileSync(input);
		const size = width && height ? `${width}×${height}` : "未知尺寸";
		return {
			buffer,
			format,
			mime,
			cropped: false,
			note:
				width === height
					? `已是正方形（${width}×${height}）`
					: `保持原比例（${size}）`,
		};
	}

	const side = Math.min(width, height);
	let pipeline = sharp(input, isBuffer ? {} : { failOn: "none" })
		.rotate() // 依据 EXIF 自动摆正
		.resize(side, side, { fit: "cover", position: "centre" });

	if (mime === "image/jpeg")
		pipeline = pipeline.flatten({ background: "#ffffff" });

	switch (mime) {
		case "image/jpeg":
			pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
			break;
		case "image/webp":
			pipeline = pipeline.webp({ quality: 88 });
			break;
		case "image/avif":
			pipeline = pipeline.avif({ quality: 70 });
			break;
		case "image/bmp":
			pipeline = pipeline.png();
			break;
		default:
			pipeline = pipeline.png({ compressionLevel: 9 });
	}

	const outBuffer = await pipeline.toBuffer();
	return {
		buffer: outBuffer,
		format: mime === "image/bmp" ? "png" : format,
		mime: mime === "image/bmp" ? "image/png" : mime,
		cropped: true,
		note: `已按中间裁剪为正方形（${width}×${height} → ${side}×${side}）`,
	};
}

/** 写入 public/friends/ 并返回站内路径 */
function saveToPublic(title, prepared) {
	const ext =
		prepared.format === "jpeg" ? "jpg" : (EXT_BY_MIME[prepared.mime] ?? "png");
	const fileName = safeFileName(title, ext);
	fs.mkdirSync(FRIENDS_PUBLIC_DIR, { recursive: true });
	fs.writeFileSync(path.join(FRIENDS_PUBLIC_DIR, fileName), prepared.buffer);
	return {
		fileName,
		webPath: `/friends/${fileName}`,
		bytes: prepared.buffer.length,
	};
}

/**
 * 把用户填的头像字段整理成最终写入配置的值。
 * - 空值 / data URI / 以 / 开头的站内路径：原样返回
 * - 本地文件路径：裁方后拷进 public/friends/
 * - 远程 URL：下载后裁方，按需内嵌
 * - 其它（无效值）：留空并提示
 */
async function prepareAvatar(rawInput, title) {
	const value = (rawInput ?? "").trim();
	const opts = {
		crop: !flags.has("no-crop"),
		embed: flags.has("embed"),
		noDownload: flags.has("no-download"),
	};

	if (!value) {
		console.log("  头像处理：未填写，卡片将显示首字母占位图");
		return "";
	}
	if (value.startsWith("data:") || value.startsWith("/")) {
		console.log("  头像处理：已是可用的本地形式，原样保留");
		return value;
	}

	// ---- 本地文件 ----
	const localPath = resolveLocalFile(value);
	if (localPath) {
		const original = fs.statSync(localPath).size;
		const prepared = await toSquareBuffer(localPath, opts);
		if (opts.embed && prepared.buffer.length <= EMBED_SIZE_LIMIT) {
			console.log(
				`  头像处理：本地文件 ${path.basename(localPath)}，${prepared.note}，已内嵌为 data URI（${(prepared.buffer.length / 1024).toFixed(1)} KB）`,
			);
			return `data:${prepared.mime};base64,${prepared.buffer.toString("base64")}`;
		}
		const saved = saveToPublic(title, prepared);
		console.log(
			`  头像处理：本地文件 ${path.basename(localPath)}（${(original / 1024).toFixed(1)} KB）→ ${prepared.note}，已拷到 public/friends/${saved.fileName}（${(saved.bytes / 1024).toFixed(1)} KB）`,
		);
		return saved.webPath;
	}

	// ---- 远程 URL ----
	if (!/^https?:\/\//i.test(value)) {
		console.log(
			"  头像处理：既不是存在的本地文件，也不是 http(s) URL，已留空（卡片会显示首字母占位图）",
		);
		return "";
	}
	if (opts.noDownload) {
		console.log("  头像处理：--no-download，保留原始远程 URL（不裁剪）");
		return value;
	}

	let res;
	try {
		res = await fetch(value, {
			headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" },
			redirect: "follow",
		});
	} catch (error) {
		console.log(`  头像处理：下载失败（${error.message}），已保留原始 URL`);
		return value;
	}
	if (!res.ok) {
		console.log(
			`  头像处理：下载失败（HTTP ${res.status}${res.status === 403 ? "，防盗链" : ""}），已保留原始 URL`,
		);
		return value;
	}

	const downloaded = Buffer.from(await res.arrayBuffer());
	if (downloaded.length === 0) {
		console.log("  头像处理：下载到 0 字节，已保留原始 URL");
		return value;
	}

	const prepared = await toSquareBuffer(downloaded, opts);
	if (opts.embed) {
		if (prepared.buffer.length <= EMBED_SIZE_LIMIT) {
			console.log(
				`  头像处理：${prepared.note}，已内嵌为 data URI（${(prepared.buffer.length / 1024).toFixed(1)} KB）`,
			);
			return `data:${prepared.mime};base64,${prepared.buffer.toString("base64")}`;
		}
		console.log(
			`  头像处理：裁剪后 ${(prepared.buffer.length / 1024).toFixed(0)} KB 超过 ${EMBED_SIZE_LIMIT / 1024} KB，未内嵌，改为自托管`,
		);
	}

	const saved = saveToPublic(title, prepared);
	console.log(
		`  头像处理：已下载（${(downloaded.length / 1024).toFixed(1)} KB），${prepared.note}，保存为 public/friends/${saved.fileName}（${(saved.bytes / 1024).toFixed(1)} KB）`,
	);
	return saved.webPath;
}

function renderEntry(entry) {
	const tags = entry.tags.map((t) => `"${escapeForTs(t)}"`).join(", ");
	return [
		"\t{",
		`\t\ttitle: "${escapeForTs(entry.title)}",`,
		`\t\timgurl: "${escapeForTs(entry.imgurl)}",`,
		`\t\tdesc: "${escapeForTs(entry.desc)}",`,
		`\t\tsiteurl: "${escapeForTs(entry.siteurl)}",`,
		`\t\ttags: [${tags}],`,
		`\t\tweight: ${entry.weight},`,
		`\t\tenabled: ${entry.enabled === false ? "false" : "true"},`,
		"\t},",
	].join("\n");
}

/** 取出 friendsConfig 数组里第 index 个条目的文本区间与其字段 */
function entryBlockAt(text, index) {
	const { bodyStart, bodyEnd } = arrayBounds(text);
	const body = text.slice(bodyStart, bodyEnd);
	const blocks = [...body.matchAll(/\n?\t\{[\s\S]*?\n\t\},?/g)];
	if (index < 0 || index >= blocks.length) return null;
	const raw = blocks[index][0];
	const field = (name, fallback = "") =>
		raw.match(new RegExp(`${name}:\\s*"((?:[^"\\\\]|\\\\.)*)"`))?.[1] ??
		fallback;
	const unescapeTs = (v) => v.replace(/\\(.)/g, "$1");
	return {
		raw,
		bodyStart,
		start: bodyStart + blocks[index].index,
		end: bodyStart + blocks[index].index + raw.length,
		entry: {
			title: unescapeTs(field("title")),
			imgurl: unescapeTs(field("imgurl")),
			desc: unescapeTs(field("desc")),
			siteurl: unescapeTs(field("siteurl")),
			tags: (raw.match(/tags:\s*\[([^\]]*)\]/)?.[1] ?? "")
				.split(",")
				.map((t) => unescapeTs(t.trim().replace(/^"|"$/g, "")))
				.filter(Boolean),
			weight: Number.parseInt(raw.match(/weight:\s*(-?\d+)/)?.[1] ?? "10", 10),
			enabled: !/enabled:\s*false/.test(raw),
		},
	};
}

/** 用新条目替换第 index 个条目，保留条目前后的空白结构 */
function replaceEntryAt(text, index, entry) {
	const found = entryBlockAt(text, index);
	if (!found) return null;
	// 原块可能以换行开头（保留那个换行），以 "\t}," 结尾
	const prefix = found.raw.startsWith("\n") ? "\n" : "";
	const replacement = prefix + renderEntry(entry).replace(/\n$/, "");
	return text.slice(0, found.start) + replacement + text.slice(found.end);
}

function appendEntry(text, entry) {
	const { bodyStart, bodyEnd } = arrayBounds(text);
	const body = text.slice(bodyStart, bodyEnd);
	const trimmed = body.trim();

	let nextBody;
	if (trimmed === "") {
		nextBody = `\n${renderEntry(entry)}\n`;
	} else {
		const separator = body.trimEnd().endsWith(",") ? "" : ",";
		nextBody = `${body.trimEnd()}${separator}\n${renderEntry(entry)}\n`;
	}
	return text.slice(0, bodyStart) + nextBody + text.slice(bodyEnd);
}

/** 删除第 index 个条目（0 起） */
function removeEntry(text, index) {
	const { bodyStart, bodyEnd } = arrayBounds(text);
	const body = text.slice(bodyStart, bodyEnd);
	const re = /\n?\t\{[\s\S]*?\n\t\},?/g;
	const blocks = [...body.matchAll(re)];
	if (index < 0 || index >= blocks.length) return null;
	const target = blocks[index];
	const nextBody =
		body.slice(0, target.index) + body.slice(target.index + target[0].length);
	const cleaned =
		nextBody.trim() === "" ? "\n" : nextBody.replace(/\n{3,}/g, "\n\n");
	return text.slice(0, bodyStart) + cleaned + text.slice(bodyEnd);
}

// ---------------------------------------------------------------------------
// 参数与交互
// ---------------------------------------------------------------------------

// 第一个非 -- 开头的参数才是子命令（add / list / remove），其余都是选项
const rawArgs = process.argv.slice(2);
const firstPositional = rawArgs.findIndex((a) => !a.startsWith("--"));
const mode = firstPositional === -1 ? "add" : rawArgs[firstPositional];

const flags = new Map();
const argsForFlags =
	firstPositional === -1
		? rawArgs
		: rawArgs.filter((_, i) => i !== firstPositional);
for (let i = 0; i < argsForFlags.length; i += 1) {
	const arg = argsForFlags[i];
	if (!arg.startsWith("--")) continue;
	const [key, ...rest] = arg.slice(2).split("=");
	const value = rest.length > 0 ? rest.join("=") : (argsForFlags[i + 1] ?? "");
	flags.set(key, value);
}

const text = readConfig();
const entries = parseEntries(
	text.slice(arrayBounds(text).bodyStart, arrayBounds(text).bodyEnd),
);

// 是否进入交互式问答。各子命令的判定不同：
//   add    —— 命令行给全 --title 与 --url 才算非交互（这两个是必填项）
//   edit   —— 只要命令行带了任何「会改内容」的参数就直接改、不发问；
//             只有 --index（或什么都不给）时进交互问答逐项确认
//   remove —— 只认 --index / 交互输入序号
const interactiveFlag = flags.has("interactive");
// 这些是流程控制参数，出现它们不代表用户想改字段
const NON_CONTENT_FLAGS = new Set(["index", "interactive", "dry-run"]);
const hasEditArgs = [...flags.keys()].some((k) => !NON_CONTENT_FLAGS.has(k));
const nonInteractive =
	!interactiveFlag &&
	(mode === "edit" ? hasEditArgs : flags.has("title") && flags.has("url"));

const rl = nonInteractive ? null : createInterface({ input, output });
const ask = async (question, { required = false, fallback = "" } = {}) => {
	while (true) {
		const answer = (
			await rl.question(
				fallback ? `${question}（回车用 ${fallback}）: ` : `${question}: `,
			)
		).trim();
		if (answer) return answer;
		if (fallback) return fallback;
		if (!required) return "";
		console.log("  这一项是必填的，请重新输入。");
	}
};

/** 优先取命令行参数；非交互模式下直接用默认值，不再发问 */
const askOrFlag = async (flagName, question, options = {}) => {
	if (flags.has(flagName)) return flags.get(flagName);
	if (nonInteractive) return options.fallback ?? "";
	return ask(question, options);
};

if (mode === "list") {
	if (entries.length === 0) {
		console.log("当前没有任何友链。用 `pnpm friend` 添加。");
	} else {
		console.log(`共 ${entries.length} 条友链：`);
		entries.forEach((title, i) => {
			console.log(`  ${i + 1}. ${title}`);
		});
	}
	process.exit(0);
}

if (mode === "remove") {
	if (entries.length === 0) {
		console.log("当前没有任何友链，无需移除。");
		rl?.close();
		process.exit(0);
	}
	entries.forEach((title, i) => {
		console.log(`  ${i + 1}. ${title}`);
	});
	const indexFlag = flags.get("index");
	if (indexFlag === undefined && !rl) {
		console.error("非交互模式下请用 --index=<序号> 指定要移除的友链。");
		process.exit(1);
	}
	const picked = Number.parseInt(
		indexFlag ?? (await ask("要移除第几条", { required: true })),
		10,
	);
	if (!Number.isInteger(picked) || picked < 1 || picked > entries.length) {
		console.error("序号无效。");
		rl?.close();
		process.exit(1);
	}
	const next = removeEntry(text, picked - 1);
	if (next === null) {
		console.error("移除失败。");
		rl?.close();
		process.exit(1);
	}
	fs.writeFileSync(CONFIG_PATH, next);
	console.log(`已移除「${entries[picked - 1]}」。`);
	rl?.close();
	process.exit(0);
}

// ---- 编辑 ----
if (mode === "edit") {
	if (entries.length === 0) {
		console.log("当前没有任何友链，请先用 `pnpm friend` 添加。");
		rl?.close();
		process.exit(0);
	}

	entries.forEach((title, i) => {
		console.log(`  ${i + 1}. ${title}`);
	});

	const indexFlag = flags.get("index");
	const picked = Number.parseInt(
		indexFlag ?? (await ask("要编辑第几条", { required: true })),
		10,
	);
	if (!Number.isInteger(picked) || picked < 1 || picked > entries.length) {
		console.error("序号无效。");
		rl?.close();
		process.exit(1);
	}

	const found = entryBlockAt(text, picked - 1);
	if (!found) {
		console.error("读取该条目失败。");
		rl?.close();
		process.exit(1);
	}
	const before = found.entry;
	console.log(`\n编辑「${before.title}」（直接回车 = 保持原值）\n`);

	// 交互模式下以当前值作为默认值；非交互模式只改命令行显式给出的字段
	const editField = async (flagName, question, current) => {
		if (flags.has(flagName)) return flags.get(flagName);
		if (nonInteractive) return current;
		const answer = (
			await rl.question(`${question}（回车保持「${current}」）: `)
		).trim();
		return answer === "" ? current : answer;
	};

	const next = {
		title: await editField("title", "站点名", before.title),
		siteurl: await editField("url", "站点地址", before.siteurl),
		imgurl: before.imgurl,
		desc: await editField("desc", "一句话描述", before.desc),
		tags: (
			await editField("tags", "分类标签（逗号分隔）", before.tags.join(","))
		)
			.split(/[,，]/)
			.map((t) => t.trim())
			.filter(Boolean),
		weight: Number.parseInt(
			await editField(
				"weight",
				"权重（数字越大越靠前）",
				String(before.weight),
			),
			10,
		),
		enabled: before.enabled,
	};

	if (!/^https?:\/\//i.test(next.siteurl)) {
		console.error("站点地址必须以 http:// 或 https:// 开头。");
		rl?.close();
		process.exit(1);
	}
	if (!Number.isInteger(next.weight)) {
		console.error("权重必须是整数。");
		rl?.close();
		process.exit(1);
	}

	// 头像：给了 --img 就重新处理（本地文件/远程 URL 都会裁方自托管）；
	// --remove-image 清空；否则保持原值
	if (flags.has("remove-image")) {
		next.imgurl = "";
		console.log("  头像处理：已按要求清空（卡片显示首字母占位图）");
	} else if (flags.has("img")) {
		next.imgurl = await prepareAvatar(flags.get("img"), next.title);
	} else if (nonInteractive) {
		console.log(`  头像保持原值：${before.imgurl || "（空）"}`);
	} else {
		const answer = (
			await rl.question(
				`头像（回车保持「${before.imgurl || "空"}」，输入 removed 清空）: `,
			)
		).trim();
		if (answer === "removed" || answer === "清空") {
			next.imgurl = "";
			console.log("  头像处理：已清空");
		} else if (answer) {
			next.imgurl = await prepareAvatar(answer, next.title);
		}
	}

	// enabled 开关
	if (flags.has("disable")) next.enabled = false;
	else if (flags.has("enable")) next.enabled = true;
	else if (!nonInteractive) {
		const answer = (
			await rl.question(
				`是否启用（回车保持「${before.enabled ? "启用" : "停用"}」，输入 n 停用 / y 启用）: `,
			)
		).trim();
		if (/^n(o)?$/i.test(answer)) next.enabled = false;
		if (/^y(es)?$/i.test(answer)) next.enabled = true;
	}

	// 改了标题且头像在 public/friends/<旧名> 下时，顺带把文件改名，避免文件名与站点名脱节
	if (next.title !== before.title && before.imgurl.startsWith("/friends/")) {
		const oldPath = path.join("public", before.imgurl);
		if (fs.existsSync(oldPath)) {
			const ext = path.extname(before.imgurl).replace(/^\./, "");
			const newName = safeFileName(next.title, ext);
			const newRel = `/friends/${newName}`;
			if (
				newRel !== before.imgurl &&
				!fs.existsSync(path.join("public", newRel))
			) {
				fs.renameSync(oldPath, path.join("public", newRel));
				next.imgurl = newRel;
				console.log(`  头像文件改名：${before.imgurl} → ${newRel}`);
			}
		}
	}

	const updated = replaceEntryAt(text, picked - 1, next);
	if (updated === null) {
		console.error("写入失败。");
		rl?.close();
		process.exit(1);
	}
	fs.writeFileSync(CONFIG_PATH, updated);

	console.log("\n=== 修改结果 ===");
	const rows = [
		["站点名", before.title, next.title],
		["站点地址", before.siteurl, next.siteurl],
		["头像", before.imgurl || "（空）", next.imgurl || "（空）"],
		["描述", before.desc, next.desc],
		["标签", before.tags.join(","), next.tags.join(",")],
		["权重", String(before.weight), String(next.weight)],
		["启用", before.enabled ? "是" : "否", next.enabled ? "是" : "否"],
	];
	let changed = 0;
	for (const [label, from, to] of rows) {
		if (from === to) continue;
		changed += 1;
		console.log(`  ${label}: ${from} → ${to}`);
	}
	if (changed === 0) console.log("  （没有任何字段发生变化）");
	console.log(
		`\n已更新 ${path.relative(process.cwd(), CONFIG_PATH)} 中第 ${picked} 条。`,
	);
	console.log("本地 `pnpm dev` 可直接看到效果，推送后线上生效。");
	rl?.close();
	process.exit(0);
}

// ---- 添加 ----
if (!nonInteractive)
	console.log("添加友链（直接回车表示留空 / 使用默认值，Ctrl+C 取消）\n");

const title =
	flags.get("title") ?? (await ask("站点名（必填）", { required: true }));
const siteurl =
	flags.get("url") ??
	(await ask("站点地址（必填，如 https://example.com）", { required: true }));
if (!/^https?:\/\//i.test(siteurl)) {
	console.error("站点地址必须以 http:// 或 https:// 开头。");
	rl?.close();
	process.exit(1);
}
let imgurl = await askOrFlag(
	"img",
	"头像图片（本地文件路径 / 远程 URL / 以 / 开头的站内路径）",
	{
		fallback: "",
	},
);
imgurl = await prepareAvatar(imgurl, title);
const desc = await askOrFlag("desc", "一句话描述", { fallback: "" });
const tagsRaw = await askOrFlag("tags", "分类标签，逗号分隔", {
	fallback: "Blog",
});
const weightRaw = await askOrFlag("weight", "权重（数字越大越靠前）", {
	fallback: "10",
});

const weight = Number.parseInt(weightRaw, 10);
if (!Number.isInteger(weight)) {
	console.error("权重必须是整数。");
	rl?.close();
	process.exit(1);
}

const entry = {
	title,
	imgurl,
	desc,
	siteurl,
	tags: tagsRaw
		.split(/[,，]/)
		.map((t) => t.trim())
		.filter(Boolean),
	weight,
};

const before = parseEntries(
	text.slice(arrayBounds(text).bodyStart, arrayBounds(text).bodyEnd),
);
if (before.includes(entry.title)) {
	if (nonInteractive) {
		console.error(`已存在同名友链「${entry.title}」，已跳过。`);
		process.exit(1);
	}
	const ok = await ask(`已存在同名友链「${entry.title}」，仍要添加吗？(y/N)`, {
		fallback: "n",
	});
	if (!/^y(es)?$/i.test(ok)) {
		console.log("已取消。");
		rl?.close();
		process.exit(0);
	}
}

fs.writeFileSync(CONFIG_PATH, appendEntry(text, entry));
console.log(`\n已写入 ${path.relative(process.cwd(), CONFIG_PATH)}：`);
console.log(renderEntry(entry));
console.log("本地 `pnpm dev` 可直接看到效果，推送后线上生效。");
rl?.close();
