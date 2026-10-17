import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { slugifyPath, slugifySegment } from "./lib/slug.js";

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

/** 从 siteConfig.ts 里取出站点时区（不引入 tsx，保证用 node 也能直接跑） */
function readSiteTimezone() {
	try {
		const text = fs.readFileSync(
			path.join(REPO_ROOT, "src/config/siteConfig.ts"),
			"utf8",
		);
		const m = text.match(/^\s*timezone:\s*"([^"]+)"/m);
		return m?.[1] || "Asia/Shanghai";
	} catch {
		return "Asia/Shanghai";
	}
}

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
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
		positional.push(arg);
	}
}

const dryRun = flags.has("dry-run");
const sourcePath = positional[0];

if (!sourcePath) {
	console.error(
		"用法: pnpm import-post <文件路径> [--slug=... --title=... --date=... --tags=a,b --category=... --dry-run]",
	);
	process.exit(1);
}
if (!fs.existsSync(sourcePath)) {
	console.error(`找不到文件：${sourcePath}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// 读取与规范化
// ---------------------------------------------------------------------------

const raw = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const modifications = [];

/** 拆出 frontmatter（如果有） */
function splitFrontmatter(text) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) return { front: "", body: text };
	return { front: match[1], body: text.slice(match[0].length) };
}

const { front: sourceFront, body: sourceBody } = splitFrontmatter(raw);
if (sourceFront) modifications.push("丢弃源文件的 Obsidian frontmatter");

/** 找出正文里所有 fenced code 的行号区间，规范化时跳过它们 */
function fencedLineIndexes(lines) {
	const inside = new Array(lines.length).fill(false);
	let open = false;
	let marker = "";
	for (let i = 0; i < lines.length; i += 1) {
		const m = lines[i].match(/^\s*(`{3,}|~{3,})/);
		if (!open && m) {
			open = true;
			marker = m[1];
			inside[i] = true;
			continue;
		}
		if (open) {
			inside[i] = true;
			if (m && m[1][0] === marker[0] && m[1].length >= marker.length)
				open = false;
		}
	}
	return inside;
}

const LANG_ALIASES = new Map([
	["payload", "sql"],
	["console", "bash"],
	["text", "plain"],
	["plaintext", "plain"],
	["text/plain", "plain"],
]);

function normalizeBody(text) {
	const lines = text.split("\n");
	const inFence = fencedLineIndexes(lines);
	const out = [];
	let fixedCalloutSpace = 0;
	let fixedIndentedQuote = 0;
	let fixedCalloutBlank = 0;
	const fixedLangs = new Set();

	for (let i = 0; i < lines.length; i += 1) {
		let line = lines[i];

		if (!inFence[i]) {
			// 2. 引用块标记后缺空格：">[!warning] ..." -> "> [!warning] ..."
			if (/^\s{0,3}>\s*\[!/.test(line) && !/^>\s\[!/.test(line)) {
				line = line.replace(/^(\s{0,3})>\s*(\[!)/, "$1> $2");
				fixedCalloutSpace += 1;
			}
			// 3. 缩进过深的引用行：" > xxx" -> "> xxx"
			else if (
				/^\s+>\s?/.test(line) &&
				!/^\s*>/.test(line.replace(/^\s+/, ">"))
			) {
				const stripped = line.replace(/^\s+>\s?/, "> ");
				if (stripped !== line) {
					line = stripped;
					fixedIndentedQuote += 1;
				}
			} else if (/^\s{1,3}>\s/.test(line) && !/^>/.test(line)) {
				const stripped = line.replace(/^\s+>\s?/, "> ");
				if (stripped !== line) {
					line = stripped;
					fixedIndentedQuote += 1;
				}
			}
		}

		// 5. 代码块语言别名
		if (inFence[i]) {
			const m = line.match(/^(\s*)(`{3,}|~{3,})([A-Za-z0-9_+./-]+)\s*$/);
			if (m && LANG_ALIASES.has(m[3].toLowerCase())) {
				fixedLangs.add(`${m[3]}→${LANG_ALIASES.get(m[3].toLowerCase())}`);
				line = `${m[1]}${m[2]}${LANG_ALIASES.get(m[3].toLowerCase())}`;
			}
		}

		out.push(line);
	}

	// 4. callout 标记与正文之间的空行
	const compacted = [];
	for (let i = 0; i < out.length; i += 1) {
		const line = out[i];
		const next = out[i + 1];
		const isCalloutHeader = /^>\s*\[![\w-]+\][-+]?\s*.*$/.test(line);
		if (
			isCalloutHeader &&
			next !== undefined &&
			next.trim() === "" &&
			out[i + 2] &&
			/^>/.test(out[i + 2])
		) {
			compacted.push(line);
			i += 1; // 跳过那个空行
			fixedCalloutBlank += 1;
			continue;
		}
		compacted.push(line);
	}

	if (fixedCalloutSpace > 0)
		modifications.push(`补全 callout 标记空格：${fixedCalloutSpace} 处`);
	if (fixedIndentedQuote > 0)
		modifications.push(`修正多余缩进的引用行：${fixedIndentedQuote} 处`);
	if (fixedCalloutBlank > 0)
		modifications.push(`删除 callout 标记后的空行：${fixedCalloutBlank} 处`);
	if (fixedLangs.size > 0)
		modifications.push(`代码块语言归一化：${[...fixedLangs].join(", ")}`);

	// 折叠空行后行号变了，重新计算「是否在代码块内」，供标题层级归位使用
	const finalFence = fencedLineIndexes(compacted);
	const { lines: leveled, shifted } = normalizeHeadingLevels(
		compacted,
		finalFence,
	);
	if (shifted > 0)
		modifications.push(
			`标题层级归位：全部提升 ${shifted} 级（最浅标题统一为 h2）`,
		);

	return leveled.join("\n");
}

/**
 * 标题层级归位：正文最浅的标题统一提到 h2（文章标题本身是 h1）。
 * 很多笔记从 ### 起手，直接导入会让目录层级看起来很奇怪。
 */
function normalizeHeadingLevels(lines, inFence) {
	let minLevel = Number.POSITIVE_INFINITY;
	for (let i = 0; i < lines.length; i += 1) {
		if (inFence[i]) continue;
		const m = lines[i].match(/^(#{1,6})\s+\S/);
		if (m) minLevel = Math.min(minLevel, m[1].length);
	}
	if (!Number.isFinite(minLevel) || minLevel <= 2) return { lines, shifted: 0 };

	const delta = minLevel - 2;
	const next = lines.map((line, i) => {
		if (inFence[i]) return line;
		const m = line.match(/^(#{1,6})(\s+\S.*)$/);
		if (!m) return line;
		const level = Math.max(2, m[1].length - delta);
		return `${"#".repeat(level)}${m[2]}`;
	});
	return { lines: next, shifted: delta };
}

// ---------------------------------------------------------------------------
// Obsidian 图片与内链处理
// ---------------------------------------------------------------------------

const IMAGE_EXTS = new Set([
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
	"avif",
	"bmp",
	"svg",
]);
const POST_IMAGE_DIR = "public/assets/images/posts";

/** 从笔记所在目录向上找附件目录（你的 vault 是根目录下的 _Images/） */
function findAttachmentsDir(notePath, override) {
	if (override) return path.resolve(override);
	const noteDir = path.dirname(path.resolve(notePath));
	const names = ["_Images", "_images", "images", "attachments", "Assets"];
	let dir = noteDir;
	for (let depth = 0; depth < 8; depth += 1) {
		for (const name of names) {
			const candidate = path.join(dir, name);
			if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
				return candidate;
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return noteDir; // 兜底：笔记同目录
}

/** 截图压缩：无损 WebP 与调色板 PNG 取较小者；超标再缩宽 + 有损 */
async function compressScreenshot(file, { maxWidth, maxKb }) {
	const buf = fs.readFileSync(file);
	const meta = await sharp(buf).metadata();
	const srcW = meta.width ?? 0;
	const srcH = meta.height ?? 0;
	const ext = path.extname(file).slice(1).toLowerCase();

	// SVG 与动图不处理（重编码会破坏或丢掉动画）
	if (ext === "svg" || (meta.pages ?? 1) > 1) {
		return {
			buffer: buf,
			ext,
			srcW,
			srcH,
			outW: srcW,
			outH: srcH,
			srcBytes: buf.length,
			mode: "原样（SVG/动图）",
		};
	}

	const scaleTo = (width) => {
		let pipeline = sharp(buf).rotate();
		if (srcW > width) pipeline = pipeline.resize({ width });
		return pipeline;
	};

	const tryLossless = async (width) => {
		const webp = await scaleTo(width)
			.webp({ lossless: true, effort: 6 })
			.toBuffer();
		const png = await scaleTo(width)
			.png({ compressionLevel: 9, palette: true, quality: 90 })
			.toBuffer();
		// 第三个候选：原图（宽度本来就够小就原样保留）。
		// 有些截图本身就是最优的 PNG，重新编码只会变大。
		const candidates = [
			{ buffer: webp, ext: "webp", mode: "无损 WebP" },
			{ buffer: png, ext: "png", mode: "PNG 调色板" },
		];
		// 常规 PNG 压缩（不褪色）：部分截图比调色板更小
		if (ext === "png") {
			const plainPng = await scaleTo(width)
				.png({ compressionLevel: 9 })
				.toBuffer();
			candidates.push({ buffer: plainPng, ext: "png", mode: "PNG 常规压缩" });
		}
		if (srcW > 0 && srcW <= width) {
			candidates.push({ buffer: buf, ext, mode: "保持原图（已足够紧凑）" });
		}
		candidates.sort((a, b) => a.buffer.length - b.buffer.length);
		// 兜底：若所有候选都比原图大，就保留原图（缩放/重编码反而变大不划算）
		if (candidates[0].buffer.length > buf.length) {
			return { buffer: buf, ext, mode: "保持原图（重编码反而更大）" };
		}
		return candidates[0];
	};

	let width = srcW > 0 ? Math.min(srcW, maxWidth) : maxWidth;
	let picked = await tryLossless(width);
	let mode = picked.mode;

	const limitBytes = maxKb * 1024;
	if (picked.buffer.length > limitBytes) {
		// 降级：缩到 1280 宽并逐档降质量
		const fallbackWidth = Math.min(width, 1280);
		for (const quality of [92, 85, 78]) {
			const out = await scaleTo(fallbackWidth)
				.webp({ quality, effort: 6 })
				.toBuffer();
			picked = { buffer: out, ext: "webp" };
			width = fallbackWidth;
			mode = `有损 q${quality}`;
			if (out.length <= limitBytes) break;
			if (quality === 78) mode = "有损 q78（仍超标）";
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
		mode,
	};
}

const escapeAttr = (value) =>
	String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * 处理正文里的图片嵌入：
 *   ![[a.png]] / ![[a.png|300]]  → 拷贝压缩后改写为站内路径
 *   ![](相对路径.png)            → 同上
 */
async function processImages(body, ctx) {
	const { slug, notePath, attachmentsDir, maxWidth, maxKb, dryRun } = ctx;
	const report = [];
	const missing = [];
	const resolved = new Map();
	const outDirAbs = path.resolve(POST_IMAGE_DIR, slug);
	let index = 0;

	const handle = async (name) => {
		const key = name.trim();
		if (!key) return null;
		if (resolved.has(key)) return resolved.get(key);

		const candidates = [
			path.join(attachmentsDir, key),
			path.join(path.dirname(path.resolve(notePath)), key),
		];
		const abs = candidates.find((p) => fs.existsSync(p));
		if (!abs) {
			missing.push(key);
			return null;
		}

		index += 1;
		const base = path.basename(key, path.extname(key));
		const safe = slugifySegment(base).slice(0, 40) || `image-${index}`;
		const info = await compressScreenshot(abs, { maxWidth, maxKb });
		const fileName = `${String(index).padStart(2, "0")}-${safe}.${info.ext}`;
		const webPath = `/${POST_IMAGE_DIR.replace(/^public\//, "")}/${slug}/${fileName}`;

		if (!dryRun) {
			fs.mkdirSync(outDirAbs, { recursive: true });
			fs.writeFileSync(path.join(outDirAbs, fileName), info.buffer);
		}
		report.push({ source: path.basename(abs), fileName, webPath, ...info });
		resolved.set(key, webPath);
		return webPath;
	};

	let out = body;

	// 1) Obsidian 图片嵌入
	const embedRe = /!\[\[([^\]|\n]+?)(?:\|([^\]]*))?\]\]/g;
	for (const match of [...body.matchAll(embedRe)]) {
		const [raw, rawName, size] = match;
		const name = rawName.trim();
		const ext = path.extname(name).slice(1).toLowerCase();
		if (!IMAGE_EXTS.has(ext)) continue; // 笔记嵌入交给内链处理
		const webPath = await handle(name);
		if (!webPath) continue; // 缺失：保留原文，稍后统一告警
		const alt = path.basename(name, path.extname(name));
		const replacement = size?.trim()
			? `<img src="${webPath}" width="${escapeAttr(size.trim())}" alt="${escapeAttr(alt)}">`
			: `![${alt}](${webPath})`;
		out = out.split(raw).join(replacement);
	}

	// 2) 标准 Markdown 本地图片
	const mdRe = /!\[([^\]]*)\]\((?!https?:|data:|\/)([^)]+)\)/g;
	for (const match of [...out.matchAll(mdRe)]) {
		const [raw, alt, rel] = match;
		let decoded = rel.trim();
		try {
			decoded = decodeURIComponent(decoded);
		} catch {
			/* 保持原样 */
		}
		const abs = path.resolve(path.dirname(path.resolve(notePath)), decoded);
		if (!fs.existsSync(abs)) {
			missing.push(decoded);
			continue;
		}
		const webPath = await handle(path.basename(abs));
		if (!webPath) continue;
		out = out
			.split(raw)
			.join(`![${alt || path.basename(decoded)}](${webPath})`);
	}

	return { body: out, report, missing };
}

/**
 * 把 wiki 内链降级为普通文本（博客里没有对应目标，留着会渲染成怪东西）：
 *   [[某笔记]]        → 某笔记
 *   [[某笔记|显示名]]  → 显示名
 *   [[某笔记#小节]]    → 某笔记 › 小节
 * 图片嵌入不在此处理（已由 processImages 处理）。
 */
function stripWikiLinks(text) {
	const stripped = [];
	const out = text.replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (raw, _bang, inner) => {
		const parts = inner.split("|");
		const targetWithAnchor = parts[0].trim();
		const display = parts.slice(1).join("|").trim();
		const [target, ...anchorParts] = targetWithAnchor.split("#");
		const anchor = anchorParts.join("#").trim();
		const ext = path.extname(target).slice(1).toLowerCase();
		if (IMAGE_EXTS.has(ext)) return raw; // 图片留给图片流程
		const plain = display || (anchor ? `${target} › ${anchor}` : target);
		stripped.push({ raw, plain });
		return plain;
	});
	return { text: out, stripped };
}

let normalizedBody = normalizeBody(sourceBody).replace(/^\s*\n/, "");

// ---------------------------------------------------------------------------
// 推导元数据
// ---------------------------------------------------------------------------

/** 这些是写 WP 时常见的「结构标题」，不适合当作文章标题或简介来源 */
const STRUCTURAL_HEADINGS = new Set([
	"abstract",
	"summary",
	"web",
	"misc",
	"pwn",
	"reverse",
	"re",
	"crypto",
	"blockchain",
	"ai",
	"iot",
	"mobile",
	"forensics",
	"osint",
	"附录",
	"附录与脚本",
	"appendix",
]);

function firstHeading(text) {
	// 只把 h1/h2 当作可能的文章标题：更深的标题通常是"题目名/小节名"，
	// 拿它当标题会出现「标题变成某个子标题」的问题（Obsidian 笔记很常见）。
	// 先剔除代码块，否则 Python 里的 `# -*- coding -*-` 会被当成 h1。
	const withoutCode = text
		.replace(/```[\s\S]*?```/g, "")
		.replace(/~~~[\s\S]*?~~~/g, "");
	for (const line of withoutCode.split("\n")) {
		const m = line.match(/^(#{1,2})\s+(.+)$/);
		if (m && !STRUCTURAL_HEADINGS.has(m[2].trim().toLowerCase()))
			return m[2].trim();
	}
	return "";
}

/** 去掉文件名里「（提交版）」「(final)」这类前缀装饰 */
function cleanFileTitle(name) {
	return name.replace(/^[（(【[]\s*[^）)】\]]{1,12}\s*[）)】\]]\s*/, "").trim();
}

function stripMarkdown(text) {
	return text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^>\s?/gm, " ")
		.replace(/[#*_>~$|]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function deriveDescription(text) {
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (
			!line ||
			/^#{1,6}\s/.test(line) ||
			line.startsWith("```") ||
			line.startsWith(">")
		)
			continue;
		// 跳过结构标题行（如单独的 "web" / "misc"）
		if (STRUCTURAL_HEADINGS.has(line.toLowerCase())) continue;
		const clean = stripMarkdown(line);
		if (clean.length >= 12) return clean.slice(0, 140);
	}
	return stripMarkdown(text).slice(0, 140);
}

const baseName = path.basename(sourcePath).replace(/\.(md|mdx)$/i, "");
const fileTitle = cleanFileTitle(baseName) || baseName;
const title = flags.get("title") || firstHeading(normalizedBody) || fileTitle;
const slug = flags.get("slug") || slugifyPath(fileTitle);

// ---------------------------------------------------------------------------
// 图片与内链处理（放在推导简介之前，避免语法污染简介）
// ---------------------------------------------------------------------------

const attachmentsDir = findAttachmentsDir(
	sourcePath,
	flags.get("attachments") || "",
);
const maxWidth = Number(flags.get("max-width")) || 1600;
const maxKb = Number(flags.get("max-kb")) || 300;

let imageReport = { report: [], missing: [] };
if (!flags.has("no-images")) {
	imageReport = await processImages(normalizedBody, {
		slug,
		notePath: sourcePath,
		attachmentsDir,
		maxWidth,
		maxKb,
		dryRun,
	});
	normalizedBody = imageReport.body;
}

const wiki = flags.has("keep-wikilinks")
	? { text: normalizedBody, stripped: [] }
	: stripWikiLinks(normalizedBody);
normalizedBody = wiki.text;

// --no-images 时图片嵌入会残留，单独提醒（博客里无法渲染 Obsidian 语法）
const leftoverEmbeds = [...normalizedBody.matchAll(/!\[\[[^\]\n]+\]\]/g)]
	.map((m) => m[0])
	.filter((raw) => {
		const name = raw.slice(3, -2).split("|")[0].trim();
		return IMAGE_EXTS.has(path.extname(name).slice(1).toLowerCase());
	});
const sourceDate = sourceFront.match(
	/^(?:date|created):\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/m,
)?.[1];
const today = new Intl.DateTimeFormat("en-CA", {
	timeZone: readSiteTimezone(),
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
}).format(new Date());

// ---------------------------------------------------------------------------
// 更新模式：目标已存在时保留其 frontmatter，只刷新正文与被显式指定的字段
// ---------------------------------------------------------------------------

const targetRel = path.join("src/content/posts", `${slug}.md`);
const targetPath = path.resolve(targetRel);
const updateMode = flags.has("update");
const targetExists = fs.existsSync(targetPath);

let existingFrontRaw = "";
if (targetExists) {
	const existingText = fs
		.readFileSync(targetPath, "utf8")
		.replace(/^\uFEFF/, "");
	const m = existingText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	existingFrontRaw = m ? m[1].replace(/^\uFEFF/, "") : "";
}
const existingField = (key) => {
	const raw = existingFrontRaw.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1];
	if (raw === undefined) return undefined;
	return raw.trim().replace(/^["']|["']$/g, "");
};
const existingTags = (() => {
	const inline = existingFrontRaw.match(/^tags:\s*\[(.*?)\]/m)?.[1];
	if (inline !== undefined) {
		return inline
			.split(",")
			.map((t) => t.trim().replace(/^["']|["']$/g, ""))
			.filter(Boolean);
	}
	return [];
})();

// 更新模式下，未显式指定的字段沿用原文章
const keep = updateMode && targetExists;
const published =
	flags.get("date") ||
	(keep ? existingField("published") : "") ||
	sourceDate ||
	today;
const tags = flags.has("tags")
	? (flags.get("tags") || "")
			.split(/[,，]/)
			.map((t) => t.trim())
			.filter(Boolean)
	: keep
		? existingTags
		: [];
const category = flags.has("category")
	? flags.get("category") || ""
	: keep
		? (existingField("category") ?? "")
		: "";
const description =
	flags.get("description") ||
	(keep ? existingField("description") : "") ||
	deriveDescription(normalizedBody);
const image = flags.get("image") || (keep ? existingField("image") : "") || "";

const yamlString = (value) =>
	`"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** 在已有 frontmatter 文本上替换指定字段，其余字段（series/license/...）原样保留 */
function patchFrontmatter(raw, updates) {
	const lines = raw.split("\n");
	const seen = new Set();
	const out = [];
	for (const line of lines) {
		const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (m && Object.hasOwn(updates, m[1])) {
			out.push(`${m[1]}: ${updates[m[1]]}`);
			seen.add(m[1]);
		} else {
			out.push(line);
		}
	}
	for (const [key, value] of Object.entries(updates)) {
		if (!seen.has(key)) out.push(`${key}: ${value}`);
	}
	return out.join("\n");
}

let frontmatter;
if (keep) {
	// 更新：保留原 frontmatter 里的一切（含 draft / pinned / series / license 等），
	// 只覆盖标题、日期、简介、封面、标签、分类这几项
	const updates = {
		title: yamlString(title),
		published,
		description: yamlString(description),
		image: image ? yamlString(image) : '""',
		tags: `[${tags.map((t) => yamlString(t)).join(", ")}]`,
		category: category ? yamlString(category) : '""',
	};
	frontmatter = `---\n${patchFrontmatter(existingFrontRaw, updates)}\n---\n`;
} else {
	frontmatter = [
		"---",
		`title: ${yamlString(title)}`,
		`published: ${published}`,
		`description: ${yamlString(description)}`,
		`image: ${image ? yamlString(image) : '""'}`,
		`tags: [${tags.map((t) => yamlString(t)).join(", ")}]`,
		`category: ${category ? yamlString(category) : '""'}`,
		"draft: false",
		"---",
		"",
	].join("\n");
}

const finalContent = `${frontmatter}${normalizedBody.trimEnd()}\n`;

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

console.log(`源文件  : ${sourcePath}`);
console.log(`标题    : ${title}`);
console.log(`slug    : ${slug}`);
console.log(`发布日期: ${published}`);
console.log(`标签    : ${tags.join(", ") || "（无）"}`);
console.log(`分类    : ${category || "（无）"}`);
console.log(`简介    : ${description}`);
console.log(`目标    : ${targetRel}`);
console.log(`正文字数: ${normalizedBody.length} 字符`);
console.log("\n所做的规范化：");
if (modifications.length === 0) console.log("  （无需修改）");
for (const m of modifications) console.log(`  - ${m}`);

// ---------------------------------------------------------------------------
// 图片与内链的处理报告
// ---------------------------------------------------------------------------

if (!flags.has("no-images")) {
	console.log(`\n附件目录：${attachmentsDir}`);
	if (imageReport.report.length === 0) {
		console.log("图片    ：（正文里没有图片）");
	} else {
		console.log(`图片    ：共 ${imageReport.report.length} 张`);
		for (const r of imageReport.report) {
			console.log(
				`  ${r.fileName}  ${r.srcW}×${r.srcH} ${(r.srcBytes / 1024).toFixed(0)} KB → ${r.outW}×${r.outH} ${(r.buffer.length / 1024).toFixed(0)} KB（${r.mode}）`,
			);
		}
	}
}

if (wiki.stripped.length > 0) {
	console.log(`\n内链转为纯文本（${wiki.stripped.length} 处）：`);
	for (const s of wiki.stripped) console.log(`  ${s.raw} → ${s.plain}`);
}

if (imageReport.missing.length > 0) {
	console.log(`\n⚠ 找不到的附件（${imageReport.missing.length} 个）：`);
	for (const m of imageReport.missing) console.log(`  ${m}`);
}

if (leftoverEmbeds.length > 0) {
	console.log(
		`\n⚠ 仍有 ${leftoverEmbeds.length} 处 Obsidian 图片语法未被处理（--no-images）：`,
	);
	for (const raw of leftoverEmbeds) console.log(`  ${raw}`);
}

if (imageReport.missing.length > 0 && !flags.has("allow-missing")) {
	console.error(
		"\n存在找不到的附件，已中止（避免发出去一堆裂图）。确认无误可加 --allow-missing 强制导入。",
	);
	process.exit(1);
}

if (targetExists && !updateMode) {
	console.error(
		`\n目标文件已存在，未覆盖：${targetRel}\n如需按这篇笔记更新它，请加 --update。`,
	);
	process.exit(1);
}

if (updateMode && !targetExists) {
	console.log(`\n提示：目标不存在（${targetRel}），将按新建处理。`);
}

if (dryRun) {
	console.log(
		`\n[dry-run] 未写入任何文件${updateMode && targetExists ? "（更新模式）" : ""}。生成的前 40 行预览：`,
	);
	console.log(finalContent.split("\n").slice(0, 40).join("\n"));
	process.exit(0);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, finalContent);
console.log(`\n已${updateMode && targetExists ? "更新" : "写入"} ${targetRel}`);

// 更新模式下清理不再被引用的旧图片
if (updateMode && targetExists && imageReport.report.length >= 0) {
	const imageDir = path.resolve(POST_IMAGE_DIR, slug);
	if (fs.existsSync(imageDir)) {
		const keepFiles = new Set(imageReport.report.map((r) => r.fileName));
		const stale = fs.readdirSync(imageDir).filter((f) => !keepFiles.has(f));
		if (stale.length > 0) {
			for (const f of stale) fs.rmSync(path.join(imageDir, f), { force: true });
			console.log(`清理旧图片 ${stale.length} 个：${stale.join(", ")}`);
		}
	}
}
console.log("本地 `pnpm dev` 预览，确认无误后 git push 即上线。");
