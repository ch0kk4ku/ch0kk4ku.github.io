/**
 * 友链维护工具（交互式）
 *
 * 用法：
 *   pnpm friend            交互式添加一条友链
 *   pnpm friend:list       列出当前所有友链
 *   pnpm friend:remove     交互式移除一条友链
 *
 * 它只做一件事：把你填的信息追加进 src/config/friendsConfig.ts 的 friendsConfig 数组，
 * 不需要你手写 TypeScript 对象，也不会碰文件里的其它内容。
 */
import fs from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

const CONFIG_PATH = path.resolve("src/config/friendsConfig.ts");
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
		"\t\tenabled: true,",
		"\t},",
	].join("\n");
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

/** 非交互模式：--title 与 --url 都给齐时直接写入，适合脚本化调用 */
const nonInteractive = flags.has("title") && flags.has("url");

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
let imgurl = await askOrFlag("img", "头像图片地址（完整 URL 或以 / 开头）", {
	fallback: "",
});
if (imgurl && !/^(https?:\/\/|\/)/i.test(imgurl)) {
	console.log(
		"  头像地址不是完整 URL 也不是以 / 开头的路径，已留空（卡片会显示首字母占位图）。",
	);
	imgurl = "";
}
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
