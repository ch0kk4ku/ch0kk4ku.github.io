/**
 * 提交前隐私扫描：拦截"不该进公开仓库"的内容。
 *
 * 由 .githooks/pre-commit 调用，检查本次**暂存**的文件里有没有：
 *   - 私钥 / 云厂商密钥 / GitHub Token / Bearer Token
 *   - 疑似 password / api_key / secret 赋值
 *   - 中国手机号、身份证号
 *   - 内网或本机 IP、本机绝对路径
 *
 * 命中即阻止提交，并给出所在文件与行号。
 * 确认无误时可以 `git commit --no-verify` 绕过。
 *
 * 设计说明：宁可有少量误报（提示后你能一眼判断），也不要漏掉真泄露。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SKIP_PATH =
	/(^|\/)(node_modules|dist|\.astro|\.tools|\.pnpm-store)(\/|$)|pnpm-lock\.yaml$|\.min\.(js|css)$|src\/constants\/(lqips|icons-data)\.json$|docs\/images\//;

const TEXT_EXT = new Set([
	".md",
	".mdx",
	".ts",
	".js",
	".mjs",
	".cjs",
	".json",
	".astro",
	".svelte",
	".txt",
	".yml",
	".yaml",
	".toml",
	".css",
	".styl",
	".html",
	".xml",
	".env",
	".sh",
	".ps1",
	".py",
]);

const RULES = [
	{
		name: "私钥",
		re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
		why: "私钥泄露等于身份被盗用",
	},
	{ name: "AWS Access Key", re: /AKIA[0-9A-Z]{16}/, why: "云账号可能被刷爆" },
	{
		name: "GitHub Token",
		re: /gh[pousr]_[A-Za-z0-9]{20,}/,
		why: "他人可读写你的仓库",
	},
	{
		name: "Bearer Token",
		re: /Bearer\s+[A-Za-z0-9\-._~+]{24,}/,
		why: "接口凭据泄露",
	},
	{
		name: "疑似密钥赋值",
		re: /(api[_-]?key|access[_-]?key|secret|token|password|passwd)\s*[:=]\s*["'][^"'\s]{16,}["']/i,
		why: "看起来是硬编码的凭据",
	},
	{
		name: "中国手机号",
		re: /(?<!\d)1[3-9]\d{9}(?!\d)/,
		why: "个人联系方式",
	},
	{
		name: "身份证号",
		re: /(?<!\d)\d{17}[\dXx](?!\d)/,
		why: "高敏感个人信息",
	},
	{
		name: "内网或本机 IP",
		re: /(?<!\d)(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?!\d)/,
		why: "可能暴露内网结构",
	},
	{
		name: "本机用户目录路径",
		re: /[A-Za-z]:\\Users\\[^\\\s"']+|[A-Za-z]:\\documents\\/i,
		why: "暴露本机目录结构（含可能的用户名）",
	},
];

/** 取暂存区文件列表；环境变量 PRE_COMMIT_FILES 可覆盖（便于测试） */
function stagedFiles() {
	if (process.env.PRE_COMMIT_FILES) {
		return process.env.PRE_COMMIT_FILES.split(/[;,]/)
			.map((s) => s.trim())
			.filter(Boolean);
	}
	try {
		const out = execFileSync(
			"git",
			["diff", "--cached", "--name-only", "--diff-filter=ACM"],
			{ encoding: "utf8" },
		);
		return out.split(/\r?\n/).filter(Boolean);
	} catch (err) {
		console.log(`[隐私检查] 无法读取 git 暂存区（${err.message}），已跳过`);
		return null;
	}
}

const files = stagedFiles();
if (files === null) process.exit(0);
if (files.length === 0) process.exit(0);

const findings = [];
for (const rel of files) {
	if (SKIP_PATH.test(rel)) continue;
	const ext = path.extname(rel).toLowerCase();
	if (!TEXT_EXT.has(ext) && !path.basename(rel).startsWith(".env")) continue;
	if (!fs.existsSync(rel)) continue;

	let text;
	try {
		text = fs.readFileSync(rel, "utf8");
	} catch {
		continue;
	}
	const lines = text.split(/\r?\n/);
	for (const rule of RULES) {
		lines.forEach((line, index) => {
			if (line.length > 4000) return; // 压缩/长行跳过，避免误报与卡顿
			const m = line.match(rule.re);
			if (!m) return;
			findings.push({
				file: rel,
				line: index + 1,
				kind: rule.name,
				why: rule.why,
				sample: m[0].slice(0, 80),
			});
		});
	}
}

if (findings.length === 0) process.exit(0);

console.error("\n✖ 提交被拦截：暂存的文件里可能有不该公开的内容\n");
for (const f of findings.slice(0, 30)) {
	console.error(`  ${f.file}:${f.line}  [${f.kind}]`);
	console.error(`      ${f.sample}`);
	console.error(`      原因：${f.why}`);
}
if (findings.length > 30) {
	console.error(`  …… 还有 ${findings.length - 30} 处`);
}
console.error(
	[
		"",
		"处理方式：",
		"  1. 打开对应文件，删掉/打码这些内容后重新 git add",
		"  2. 若是误报（例如示例 ID、版本号），可以临时绕过：",
		"       git commit --no-verify",
		"  3. 如果是密码/令牌，建议立刻作废并重新生成（历史里可能已经留下）",
		"",
	].join("\n"),
);
process.exit(1);
