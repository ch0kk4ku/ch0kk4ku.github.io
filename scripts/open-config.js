/**
 * 配置导航：告诉你在哪改什么，并帮你直接打开对应文件。
 *
 * 用法：
 *   pnpm config                 按用途列出所有可改配置（不打开文件）
 *   pnpm config site            打开「站点信息」相关文件（关键词匹配）
 *   pnpm config 公告 友链        可一次给多个关键词
 *   pnpm config --all           打开全部可编辑配置（含内容文件）
 *   pnpm config --folder        直接打开整个 src/config 目录
 *   pnpm config --content       打开日常内容：文章目录 + 关于我 + 留言板 + 友链页
 *   pnpm config --editor=notepad  指定编辑器（默认自动探测 code → notepad）
 *
 * 说明：只做「打开文件」，不改任何内容。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();

/**
 * 配置清单：每一项对应一个可编辑目标。
 * group 用于聚合展示；hot 标记日常高频；disabled 提示当前是否启用。
 */
const TARGETS = [
	// ── 站点与外观 ────────────────────────────────────────────────
	{
		key: "site",
		group: "站点与外观",
		label: "站点信息",
		file: "src/config/siteConfig.ts",
		desc: "标题/副标题/描述/关键词/站点URL/主题色/页宽/页面开关/页脚等",
	},
	{
		key: "profile",
		group: "站点与外观",
		label: "个人资料",
		file: "src/config/profileConfig.ts",
		desc: "昵称/签名/头像路径/社交链接（GitHub、邮箱、RSS）",
	},
	{
		key: "wallpaper",
		group: "站点与外观",
		label: "背景壁纸与首页横幅",
		file: "src/config/backgroundWallpaper.ts",
		desc: "壁纸、首页大标题、横幅副标题、横幅链接、水波纹等特效",
	},
	{
		key: "navbar",
		group: "站点与外观",
		label: "导航栏",
		file: "src/config/navBarConfig.ts",
		desc: "导航菜单项与顺序、「链接」子菜单",
	},
	{
		key: "sidebar",
		group: "站点与外观",
		label: "侧边栏布局",
		file: "src/config/sidebarConfig.ts",
		desc: "左右侧栏放哪些组件、组件顺序、是否在文章页显示",
	},
	{
		key: "font",
		group: "站点与外观",
		label: "字体",
		file: "src/config/fontConfig.ts",
		desc: "正文字体/标题字体/代码字体，本地或在线字体",
	},

	// ── 日常内容 ────────────────────────────────────────────────
	{
		key: "announcement",
		group: "日常内容",
		hot: true,
		label: "公告",
		file: "src/config/announcementConfig.ts",
		desc: "侧边栏公告文案与「了解更多」链接",
	},
	{
		key: "friends",
		group: "日常内容",
		hot: true,
		label: "友链数据",
		file: "src/config/friendsConfig.ts",
		desc: "友链数组（也可用 pnpm friend / friend:edit 命令维护）",
	},
	{
		key: "about",
		group: "日常内容",
		hot: true,
		label: "关于我",
		file: "src/content/spec/about.md",
		desc: "关于页正文（Markdown，可直接写）",
	},
	{
		key: "guestbook",
		group: "日常内容",
		label: "留言板",
		file: "src/content/spec/guestbook.md",
		desc: "留言板页面的说明文字",
	},
	{
		key: "friendsPage",
		group: "日常内容",
		label: "友链页文案",
		file: "src/content/spec/friends.mdx",
		desc: "友链页底部「本站信息」卡片的信息与文案",
	},
	{
		key: "posts",
		group: "日常内容",
		hot: true,
		label: "文章目录",
		dir: "src/content/posts",
		desc: "所有文章（Markdown）；新文章用 pnpm new-post 或 pnpm import-post",
	},
	{
		key: "dynamic",
		group: "日常内容",
		label: "动态（短内容）",
		dir: "src/content/dynamic",
		desc: "动态页内容；新增用 pnpm new-dynamic",
	},
	{
		key: "projects",
		group: "日常内容",
		label: "项目页内容",
		dir: "src/content/projects",
		desc: "项目卡片（当前项目页已关闭）",
		disabled: "项目页当前为关闭状态（siteConfig.pages.projects=false）",
	},

	// ── 功能开关 ────────────────────────────────────────────────
	{
		key: "comment",
		group: "功能开关",
		label: "评论系统",
		file: "src/config/commentConfig.ts",
		desc: "Twikoo/Waline/Giscus/Artalk 配置（当前 type=none 未启用）",
	},
	{
		key: "music",
		group: "功能开关",
		label: "音乐播放器",
		file: "src/config/musicConfig.ts",
		desc: "歌单、播放模式（当前导航栏与侧栏均已关闭）",
	},
	{
		key: "analytics",
		group: "功能开关",
		label: "统计分析",
		file: "src/config/analyticsConfig.ts",
		desc: "Google/Umami/51la 统计（当前全部为空、未加载）",
	},
	{
		key: "effects",
		group: "功能开关",
		label: "页面特效",
		file: "src/config/effectsConfig.ts",
		desc: "樱花飘落等特效（当前关闭）",
	},
	{
		key: "pio",
		group: "功能开关",
		label: "看板娘",
		file: "src/config/pioConfig.ts",
		desc: "Live2D / Spine 模型（当前均为关闭）",
	},
	{
		key: "codeblock",
		group: "功能开关",
		label: "代码块样式",
		file: "src/config/expressiveCodeConfig.ts",
		desc: "代码高亮主题、行号、折叠",
	},
	{
		key: "mermaid",
		group: "功能开关",
		label: "Mermaid 图表",
		file: "src/config/mermaidConfig.ts",
		desc: "流程图/时序图渲染配置",
	},
	{
		key: "plantuml",
		group: "功能开关",
		label: "PlantUML 图表",
		file: "src/config/plantumlConfig.ts",
		desc: "UML 图渲染服务地址",
	},
	{
		key: "license",
		group: "功能开关",
		label: "版权许可",
		file: "src/config/licenseConfig.ts",
		desc: "文章底部版权声明（名称与链接）",
	},
	{
		key: "coverImage",
		group: "功能开关",
		label: "封面图规则",
		file: "src/config/coverImageConfig.ts",
		desc: "没写封面时的默认/随机封面策略",
	},
	{
		key: "gallery",
		group: "功能开关",
		label: "相册",
		file: "src/config/galleryConfig.ts",
		desc: "相册与照片列表（当前相册页已关闭）",
		disabled: "相册页当前为关闭状态（siteConfig.pages.gallery=false）",
	},
	{
		key: "booknav",
		group: "功能开关",
		label: "书签导航",
		file: "src/config/booknavConfig.ts",
		desc: "网址书签分组（当前书签导航页已关闭）",
		disabled: "书签导航页当前为关闭状态（siteConfig.pages.booknav=false）",
	},
	{
		key: "sponsor",
		group: "功能开关",
		label: "打赏",
		file: "src/config/sponsorConfig.ts",
		desc: "收款码与打赏文案（当前打赏页已关闭）",
		disabled: "打赏页当前为关闭状态（siteConfig.pages.sponsor=false）",
	},
	{
		key: "display",
		group: "功能开关",
		label: "显示设置面板",
		file: "src/config/displaySettingsConfig.ts",
		desc: "右下角设置面板里显示哪些开关项",
	},
];

// ---------------------------------------------------------------------------
// 编辑器探测
// ---------------------------------------------------------------------------

const EDITOR_CANDIDATES = [
	{ cmd: "code", label: "VS Code" },
	{ cmd: "code-insiders", label: "VS Code Insiders" },
	{ cmd: "cursor", label: "Cursor" },
	{ cmd: "notepad++", label: "Notepad++" },
	{ cmd: "notepad", label: "记事本" },
];

function which(cmd) {
	const r = spawnSync("where", [cmd], { encoding: "utf8", shell: false });
	return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

/** 用系统 PATH 上的编辑器打开给定路径 */
function openWith(editor, paths) {
	const args = paths.map((p) => path.resolve(REPO_ROOT, p));
	// Windows 上 .cmd 需要用 shell 启动；同时避免 output 捕获（本机受限环境下无法捕获子进程输出）
	const isWinScript = process.platform === "win32";
	const r = isWinScript
		? spawnSync(`${editor} ${args.map((a) => `"${a}"`).join(" ")}`, {
				shell: true,
				stdio: "ignore",
			})
		: spawnSync(editor, args, { stdio: "ignore" });
	return r.status === 0 || r.status === null;
}

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Map();
const keywords = [];
for (const a of argv) {
	if (a.startsWith("--")) {
		const [k, ...rest] = a.slice(2).split("=");
		flags.set(k, rest.join("=") || "true");
	} else {
		keywords.push(a);
	}
}

const showAll = flags.has("all");
const showFolder = flags.has("folder");
const showContent = flags.has("content");
const explicitEditor = flags.get("editor");

const pad = (s, n) => {
	// 中文按 2 格宽度估算，保证表格对齐
	const width = [...String(s)].reduce(
		(w, ch) => w + (/[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1),
		0,
	);
	return String(s) + " ".repeat(Math.max(0, n - width));
};

function printTable(list) {
	let lastGroup = "";
	for (const t of list) {
		if (t.group !== lastGroup) {
			console.log(`\n【${t.group}】`);
			lastGroup = t.group;
		}
		const hot = t.hot ? "★" : " ";
		const target = t.file ?? t.dir;
		console.log(`  ${hot} ${pad(t.label, 20)} ${target}`);
		console.log(
			`      ${pad("", 20)} ${t.desc}${t.disabled ? `  ⚠ ${t.disabled}` : ""}`,
		);
	}
}

function match(keywords) {
	// 分层匹配，避免「站点」这类词把整组描述都命中：
	//   第 1 层：key / label / 文件名 —— 精确优先
	//   第 2 层：描述文字 —— 只有第 1 层完全没命中时才用
	const layer1 = (t, k) =>
		[t.key, t.label, t.file, t.dir]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
			.includes(k.toLowerCase());
	const layer2 = (t, k) =>
		[t.desc, t.group]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
			.includes(k.toLowerCase());

	const hits = new Set();
	for (const k of keywords) {
		const exact = TARGETS.filter((t) => layer1(t, k));
		if (exact.length > 0) {
			for (const t of exact) hits.add(t);
			continue;
		}
		for (const t of TARGETS.filter((x) => layer2(x, k))) hits.add(t);
	}
	// 保持清单原有顺序
	return TARGETS.filter((t) => hits.has(t));
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

if (showFolder) {
	const editor =
		explicitEditor ||
		EDITOR_CANDIDATES.map((c) => (which(c.cmd) ? c.cmd : null)).find(Boolean) ||
		"code";
	console.log(`用「${editor}」打开目录 src/config …`);
	openWith(editor, ["src/config"]);
	process.exit(0);
}

if (showContent) {
	const editor =
		explicitEditor ||
		EDITOR_CANDIDATES.map((c) => (which(c.cmd) ? c.cmd : null)).find(Boolean) ||
		"code";
	const paths = [
		"src/content/posts",
		"src/content/spec/about.md",
		"src/content/spec/guestbook.md",
		"src/content/spec/friends.mdx",
	];
	console.log(`用「${editor}」打开日常内容：`);
	for (const p of paths) console.log(`  ${p}`);
	openWith(editor, paths);
	process.exit(0);
}

if (keywords.length === 0 && !showAll) {
	// 只列清单
	console.log("可编辑的配置与内容（★ = 日常高频）\n");
	console.log("  用法：pnpm config <关键词>        例如 pnpm config 公告");
	console.log("        pnpm config 站点 友链       可一次给多个关键词");
	console.log("        pnpm config --all           打开全部");
	console.log(
		"        pnpm config --content       打开日常内容（文章/关于我/留言板/友链页）",
	);
	console.log("        pnpm config --folder        打开整个 src/config 目录");
	printTable(TARGETS);
	const hot = TARGETS.filter((t) => t.hot);
	console.log(
		`\n最常改的 ${hot.length} 项：${hot.map((t) => `${t.label}(${t.file ?? t.dir})`).join("、")}`,
	);
	console.log(
		`\n共 ${TARGETS.length} 个目标。内容目录里的文件也可以直接用 pnpm new-post / import-post / friend 等命令维护。`,
	);
	process.exit(0);
}

const selected = showAll ? TARGETS : match(keywords);
if (selected.length === 0) {
	console.error(
		`没有匹配「${keywords.join(" ")}」的目标。运行 pnpm config 查看全部清单。`,
	);
	process.exit(1);
}

// 目标路径（文件不存在时给出提示）
const paths = [];
for (const t of selected) {
	const p = t.file ?? t.dir;
	const abs = path.resolve(REPO_ROOT, p);
	if (!fs.existsSync(abs)) {
		console.warn(`⚠ 不存在，已跳过：${p}`);
		continue;
	}
	paths.push(p);
}

if (paths.length === 0) {
	console.error("没有可打开的目标。");
	process.exit(1);
}

const editorCmd =
	explicitEditor ||
	EDITOR_CANDIDATES.map((c) => (which(c.cmd) ? c.cmd : null)).find(Boolean) ||
	"code";

console.log(`用「${editorCmd}」打开 ${paths.length} 个目标：`);
for (const p of paths) console.log(`  ${p}`);
if (selected.some((t) => t.disabled)) {
	console.log("\n注意：");
	for (const t of selected.filter((x) => x.disabled))
		console.log(`  - ${t.label}：${t.disabled}`);
}
openWith(editorCmd, paths);
