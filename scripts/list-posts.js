/**
 * 文章清单：列出所有文章的元信息（标题、日期、分类、标签、封面、草稿等）。
 *
 * 用法：
 *   pnpm posts                  列出全部文章
 *   pnpm posts --tags           按标签汇总（看有哪些标签、各几篇）
 *   pnpm posts --categories     按分类汇总
 *   pnpm posts --drafts         只看草稿
 *   pnpm posts --open           在编辑器里打开所有文章文件
 *   pnpm posts <关键词>          过滤标题/标签/分类含该词的文章
 *
 * 只读，不修改任何文件。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const POSTS_DIR = path.resolve("src/content/posts");

// ---------------------------------------------------------------------------
// frontmatter 解析（够用即可，不做完整 YAML）
// ---------------------------------------------------------------------------
function parseFrontmatter(text) {
	const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!m) return {};
	const body = m[1];
	const pick = (key) => {
		const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
		const raw = body.match(re)?.[1]?.trim();
		if (raw === undefined) return undefined;
		return raw.replace(/^["']|["']$/g, "");
	};
	const list = (key) => {
		const raw = body.match(new RegExp(`^${key}:\\s*\\[(.*?)\\]`, "m"))?.[1];
		if (raw !== undefined) {
			return raw
				.split(",")
				.map((s) => s.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
		}
		// 也支持 YAML 列表写法：
		// tags:
		//   - a
		//   - b
		const block = body.match(
			new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)+)`, "m"),
		)?.[1];
		if (block) {
			return block
				.split("\n")
				.map((l) =>
					l
						.replace(/^\s*-\s*/, "")
						.trim()
						.replace(/^["']|["']$/g, ""),
				)
				.filter(Boolean);
		}
		return [];
	};
	return {
		title: pick("title") ?? "(无标题)",
		published: pick("published") ?? "",
		updated: pick("updated"),
		category: pick("category") ?? "",
		description: pick("description") ?? "",
		image: pick("image") ?? "",
		draft: (pick("draft") ?? "false") === "true",
		pinned: (pick("pinned") ?? "false") === "true",
		password: pick("password") ?? "",
		series: pick("series") ?? "",
		tags: list("tags"),
	};
}

// ---------------------------------------------------------------------------
// 收集
// ---------------------------------------------------------------------------
const files = fs
	.readdirSync(POSTS_DIR, { recursive: true })
	.filter((f) => typeof f === "string" && /\.(md|mdx)$/i.test(f))
	.map((f) => f.split(path.sep).join("/"));

const posts = files.map((rel) => {
	const full = path.join(POSTS_DIR, rel);
	const text = fs.readFileSync(full, "utf8");
	return { rel, full, size: fs.statSync(full).size, ...parseFrontmatter(text) };
});

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);

// 别名归一化：--cats / cats / 分类 都算 --categories，方便手写
const FLAG_ALIASES = {
	cats: "categories",
	cat: "categories",
	categories: "categories",
	tag: "tags",
	tags: "tags",
	draft: "drafts",
	drafts: "drafts",
	open: "open",
};

const flags = new Set();
const keywords = [];
for (const a of argv) {
	if (a.startsWith("--")) {
		const name = a.slice(2);
		flags.add(FLAG_ALIASES[name] ?? name);
	} else {
		keywords.push(a);
	}
}

const pad = (s, n) => {
	const w = [...String(s)].reduce(
		(acc, ch) => acc + (/[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1),
		0,
	);
	return String(s) + " ".repeat(Math.max(0, n - w));
};

const which = (cmd) =>
	spawnSync("where", [cmd], { encoding: "utf8" }).status === 0;

// ---------------------------------------------------------------------------
// 输出模式
// ---------------------------------------------------------------------------
if (flags.has("open")) {
	const editor =
		["code", "code-insiders", "cursor", "notepad++", "notepad"].find(which) ??
		"notepad";
	const paths = posts.map((p) => p.full);
	console.log(`用「${editor}」打开 ${paths.length} 篇文章`);
	spawnSync(`${editor} ${paths.map((p) => `"${p}"`).join(" ")}`, {
		shell: true,
		stdio: "ignore",
	});
	process.exit(0);
}

if (flags.has("tags")) {
	const counts = new Map();
	for (const p of posts)
		for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
	console.log(`共 ${counts.size} 个标签：\n`);
	for (const [t, n] of [...counts].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	)) {
		console.log(`  ${pad(t, 22)} ${n} 篇`);
	}
	const untagged = posts.filter((p) => p.tags.length === 0);
	if (untagged.length) {
		console.log(`\n没有标签的文章：${untagged.map((p) => p.rel).join(", ")}`);
	}
	process.exit(0);
}

if (flags.has("categories")) {
	const counts = new Map();
	for (const p of posts) {
		const c = p.category || "(未分类)";
		counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	console.log("按分类汇总：\n");
	for (const [c, n] of [...counts].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${pad(c, 22)} ${n} 篇`);
	}
	process.exit(0);
}

let list = posts;
if (flags.has("drafts")) list = list.filter((p) => p.draft);
if (keywords.length) {
	list = list.filter((p) =>
		keywords.some((k) =>
			[p.title, p.category, p.rel, ...p.tags]
				.join(" ")
				.toLowerCase()
				.includes(k.toLowerCase()),
		),
	);
}

console.log(
	`文章目录：src/content/posts（共 ${posts.length} 篇${list.length !== posts.length ? `，筛选出 ${list.length} 篇` : ""}）\n`,
);
for (const p of list) {
	const marks = [
		p.draft ? "草稿" : "",
		p.pinned ? "置顶" : "",
		p.password ? "加密" : "",
		p.series ? `系列:${p.series}` : "",
	].filter(Boolean);
	console.log(`  ${p.title}`);
	console.log(
		`    文件: ${p.rel}  (${(p.size / 1024).toFixed(1)} KB)${marks.length ? `  [${marks.join(" / ")}]` : ""}`,
	);
	console.log(
		`    发布: ${p.published}${p.updated ? `  更新: ${p.updated}` : ""}`,
	);
	console.log(`    分类: ${p.category || "（无）"}`);
	console.log(`    标签: ${p.tags.length ? p.tags.join(", ") : "（无）"}`);
	if (p.image) console.log(`    封面: ${p.image}`);
	if (p.description)
		console.log(
			`    简介: ${p.description.slice(0, 60)}${p.description.length > 60 ? "…" : ""}`,
		);
	console.log("");
}

console.log(
	"提示：改 front-matter 直接编辑文件；用 pnpm cfg content 可打开文章目录。",
);
