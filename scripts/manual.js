/**
 * 打开使用手册：用系统默认的 Markdown 查看器打开 docs 下的文档。
 *
 * 用法：
 *   pnpm manual                 打开主手册（docs/博客管理指南.md）
 *   pnpm manual 速查             按关键词挑文档打开（配置修改速查）
 *   pnpm manual --list          列出手册清单
 *   pnpm manual --print         只打印路径，不打开（方便复制/测试）
 *   pnpm manual --file=docs/xxx.md   指定文件
 *
 * 注意：命令名不能叫 help —— 那是 pnpm 的内置命令，会截走你的脚本
 * （和当初 `pnpm config` 被内置命令吃掉是同一类问题）。
 * 想用 help 这个名字的话，用 `pnpm run help`。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DOCS = [
	{
		file: "docs/博客管理指南.md",
		title: "博客管理指南",
		desc: "总入口：写文章、导入、更新、删除、友链、隐私安全",
	},
	{
		file: "docs/配置修改速查.md",
		title: "配置修改速查",
		desc: "改标题/主题色/页面开关该打开哪个文件",
	},
	{
		file: "docs/本地运行与写作指南.md",
		title: "本地运行与写作指南",
		desc: "环境、命令、写作约定、部署与排错",
	},
	{
		file: "docs/本地化改造记录.md",
		title: "本地化改造记录",
		desc: "相对上游主题改了什么，升级时要检查哪里",
	},
];

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const keywords = argv.filter((a) => !a.startsWith("--"));
const printOnly = flags.includes("--print");
const listOnly = flags.includes("--list");
const explicit = flags
	.find((f) => f.startsWith("--file="))
	?.slice("--file=".length);

const exists = (rel) => fs.existsSync(path.resolve(rel));

function printList() {
	console.log("可用手册：\n");
	for (const d of DOCS) {
		const ok = exists(d.file);
		console.log(`  ${ok ? "✔" : "✘"} ${d.title}   ${d.file}`);
		console.log(`      ${d.desc}`);
	}
	console.log("\n用法：pnpm manual [关键词]   例如 pnpm manual 速查");
}

/** 用系统默认程序打开（Windows: cmd /c start，macOS: open，Linux: xdg-open） */
function openWithDefault(file) {
	const abs = path.resolve(file);
	const platform = process.platform;
	return new Promise((resolve) => {
		let child;
		try {
			if (platform === "win32") {
				// start 的第一个参数是窗口标题，必须给空串，否则会把路径当标题
				child = spawn("cmd.exe", ["/c", "start", "", abs], {
					detached: true,
					stdio: "ignore",
					windowsHide: true,
				});
			} else if (platform === "darwin") {
				child = spawn("open", [abs], { detached: true, stdio: "ignore" });
			} else {
				child = spawn("xdg-open", [abs], { detached: true, stdio: "ignore" });
			}
		} catch (err) {
			resolve({ ok: false, error: err.message });
			return;
		}
		child.on("error", (err) => resolve({ ok: false, error: err.message }));
		// start 会立刻返回，短暂等待以捕获明显的启动失败
		child.unref();
		setTimeout(() => resolve({ ok: true }), 400);
	});
}

// ---------------------------------------------------------------------------
// 选文件
// ---------------------------------------------------------------------------

if (listOnly) {
	printList();
	process.exit(0);
}

let target = DOCS[0];

if (explicit) {
	target = {
		file: explicit,
		title: path.basename(explicit),
		desc: "手动指定",
	};
} else if (keywords.length > 0) {
	const kw = keywords.join(" ").toLowerCase();
	const hit =
		DOCS.find(
			(d) =>
				d.title.toLowerCase().includes(kw) ||
				d.file.toLowerCase().includes(kw) ||
				d.desc.toLowerCase().includes(kw),
		) ?? null;
	if (!hit) {
		console.error(`没有匹配「${keywords.join(" ")}」的手册。`);
		printList();
		process.exit(1);
	}
	target = hit;
}

if (!exists(target.file)) {
	console.error(`找不到文件：${target.file}`);
	console.error("可能是文档被改名/移动了，运行 pnpm manual --list 看清单。");
	process.exit(1);
}

const abs = path.resolve(target.file);
const kb = (fs.statSync(abs).size / 1024).toFixed(1);

console.log(`手册：${target.title}`);
console.log(`路径：${abs}（${kb} KB）`);
if (target.desc) console.log(`内容：${target.desc}`);
console.log(`打开：${printOnly ? "（--print 模式，未打开）" : "系统默认程序"}`);

if (printOnly) process.exit(0);

const result = await openWithDefault(target.file);
if (result.ok) {
	console.log("\n已调用系统默认程序。没弹出的话，复制上面的路径手动打开。");
	console.log(
		"提示：pnpm manual --list 看全部手册，pnpm manual 关键词 精确挑选。",
	);
} else {
	console.error(`\n打开失败：${result.error}`);
	console.error("请手动打开上面的路径。");
	process.exit(1);
}
