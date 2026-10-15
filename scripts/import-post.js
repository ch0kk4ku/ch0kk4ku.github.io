/**
 * 文章导入工具：把一个 Markdown 文件（例如 Obsidian 笔记）转成博客文章。
 *
 * 用法：
 *   pnpm import-post <文件路径> [选项]
 *
 * 选项：
 *   --slug=<slug>          指定 URL slug（默认由标题拼音生成）
 *   --title=<标题>         指定标题（默认取正文第一个 # 标题，其次文件名）
 *   --date=YYYY-MM-DD      发布日期（默认取源文件 frontmatter，其次今天）
 *   --tags=a,b             标签，逗号分隔（默认空）
 *   --category=CTF         分类（默认空）
 *   --description=文本      简介（默认取正文前 140 字）
 *   --image=./cover.avif   封面（默认空）
 *   --dry-run              只预览将要写入的内容与所做的修正，不落盘
 *
 * 自动做的规范化：
 *   1. 去掉源文件的 Obsidian frontmatter（tags/created 等），换成博客所需字段
 *   2. `>[!type]` 补齐空格为 `> [!type]`（否则不会被识别成 callout）
 *   3. ` > ` 这类多余缩进的引用行改回 `> `，避免引用块被拆断导致 callout 退化
 *   4. callout 标记与正文之间的空行去掉（空行会把引用块切成两块）
 *   5. 代码块语言名归一化：payload→sql、console→bash、text/plain→plain
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slugifyPath } from "./lib/slug.js";

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

const raw = fs.readFileSync(sourcePath, "utf8");
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

const normalizedBody = normalizeBody(sourceBody).replace(/^\s*\n/, "");

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
	for (const line of text.split("\n")) {
		const m = line.match(/^#{1,6}\s+(.+)$/);
		if (m && !STRUCTURAL_HEADINGS.has(m[1].trim().toLowerCase()))
			return m[1].trim();
	}
	return "";
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
const title = flags.get("title") || firstHeading(normalizedBody) || baseName;
const slug = flags.get("slug") || slugifyPath(baseName);
const sourceDate = sourceFront.match(
	/^(?:date|created):\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/m,
)?.[1];
const today = new Intl.DateTimeFormat("en-CA", {
	timeZone: readSiteTimezone(),
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
}).format(new Date());
const published = flags.get("date") || sourceDate || today;
const tags = (flags.get("tags") || "")
	.split(/[,，]/)
	.map((t) => t.trim())
	.filter(Boolean);
const category = flags.get("category") || "";
const description =
	flags.get("description") || deriveDescription(normalizedBody);
const image = flags.get("image") || "";

const yamlString = (value) =>
	`"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const frontmatter = [
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

const targetRel = path.join("src/content/posts", `${slug}.md`);
const targetPath = path.resolve(targetRel);
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

if (fs.existsSync(targetPath)) {
	console.error(`\n目标文件已存在，未覆盖：${targetRel}`);
	process.exit(1);
}

if (dryRun) {
	console.log("\n[dry-run] 未写入任何文件。生成的前 40 行预览：");
	console.log(finalContent.split("\n").slice(0, 40).join("\n"));
	process.exit(0);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, finalContent);
console.log(`\n已写入 ${targetRel}`);
console.log("本地 `pnpm dev` 预览，确认无误后 git push 即上线。");
