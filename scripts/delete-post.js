/**
 * 删除文章：连同该文章专用的图片目录一起清理。
 *
 * 用法：
 *   pnpm delete-post <slug 或 .md 文件路径>
 *   pnpm delete-post <slug> --yes            跳过确认
 *   pnpm delete-post <slug> --keep-images    只删文章，保留图片
 *   pnpm delete-post <slug> --dry-run        只显示将删除什么，不实际删除
 *
 * 安全措施：
 *   - 删除前打印文章标题、文件大小、图片数量与总体积
 *   - 默认需要输入 y 确认（--yes 可跳过）
 *   - 只删 posts 目录下的单个 .md 与该 slug 的图片目录，不动其它文件
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const POSTS_DIR = path.resolve("src/content/posts");
const IMAGES_ROOT = path.resolve("public/assets/images/posts");

const argv = process.argv.slice(2);
const flags = new Set(
	argv.filter((a) => a.startsWith("--")).map((a) => a.slice(2)),
);
const positional = argv.filter((a) => !a.startsWith("--"));
const target = positional[0];

if (!target) {
	console.error(
		"用法: pnpm delete-post <slug 或 .md 文件路径> [--yes] [--keep-images] [--dry-run]",
	);
	process.exit(1);
}

// 解析目标文件：允许传 slug（tsctf-2026-writeup）或完整/相对 md 路径
let postPath;
if (/\.mdx?$/i.test(target)) {
	postPath = path.resolve(target);
} else {
	postPath = path.join(POSTS_DIR, `${target}.md`);
	if (!fs.existsSync(postPath)) {
		const mdx = path.join(POSTS_DIR, `${target}.mdx`);
		if (fs.existsSync(mdx)) postPath = mdx;
	}
}

if (!fs.existsSync(postPath)) {
	console.error(`找不到文章：${target}`);
	process.exit(1);
}

// 必须位于 posts 目录内，避免误删其它文件
const rel = path.relative(POSTS_DIR, postPath);
if (rel.startsWith("..") || path.isAbsolute(rel)) {
	console.error(`拒绝删除 posts 目录之外的文件：${postPath}`);
	process.exit(1);
}

const slug = path.basename(postPath, path.extname(postPath));
const text = fs.readFileSync(postPath, "utf8");
const title = text.match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ?? slug;
const published = text.match(/^published:\s*(.+)$/m)?.[1]?.trim() ?? "?";
const bytes = fs.statSync(postPath).size;

const imageDir = path.join(IMAGES_ROOT, slug);
const imageFiles = fs.existsSync(imageDir)
	? fs
			.readdirSync(imageDir)
			.filter((f) => fs.statSync(path.join(imageDir, f)).isFile())
	: [];
const imageBytes = imageFiles.reduce(
	(sum, f) => sum + fs.statSync(path.join(imageDir, f)).size,
	0,
);

console.log("将要删除：");
console.log(`  文章：${path.relative(process.cwd(), postPath)}`);
console.log(`  标题：${title}`);
console.log(`  发布：${published}`);
console.log(`  正文：${(bytes / 1024).toFixed(1)} KB`);
if (flags.has("keep-images")) {
	console.log("  图片目录：保留（--keep-images）");
} else if (imageFiles.length > 0) {
	console.log(
		`  图片目录：${path.relative(process.cwd(), imageDir)}（${imageFiles.length} 张，${(imageBytes / 1024).toFixed(1)} KB）`,
	);
} else {
	console.log("  图片目录：（无）");
}

if (flags.has("dry-run")) {
	console.log("\n[dry-run] 未删除任何文件。");
	process.exit(0);
}

// 确认
if (!flags.has("yes")) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	const answer = await new Promise((resolve) => {
		rl.question("\n确认删除？此操作不可撤销（y/N）: ", resolve);
	});
	rl.close();
	if (!/^y(es)?$/i.test(String(answer).trim())) {
		console.log("已取消。");
		process.exit(0);
	}
}

fs.rmSync(postPath, { force: true });
console.log(`\n✔ 已删除文章 ${path.relative(process.cwd(), postPath)}`);

if (!flags.has("keep-images") && fs.existsSync(imageDir)) {
	fs.rmSync(imageDir, { recursive: true, force: true });
	console.log(`✔ 已删除图片目录 ${path.relative(process.cwd(), imageDir)}`);
}

// 重新生成 LQIP（失败了不影响删除结果，只提示）
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const lqip = spawnSync(npxCmd, ["tsx", "scripts/generate-lqips.ts"], {
	stdio: "ignore",
});
if (lqip.status === 0) {
	console.log("✔ LQIP 已重新生成");
} else {
	console.log("提示：LQIP 未自动生成，可稍后运行 pnpm lqips");
}
console.log("提示：记得 git add -A && git commit 记录这次删除。");
