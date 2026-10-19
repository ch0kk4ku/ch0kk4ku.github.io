/**
 * 内链校验：检查所有文章里的 [[内链]] 是否指向真实存在的文章。
 *
 * 用法：
 *   pnpm links              校验（有死链时退出码 1）
 *   pnpm links --no-strict  只报告，不因死链失败
 *   pnpm links --orphans    额外列出没有任何入链的"孤岛文章"
 *
 * 为什么需要：主题的 remark-wiki-link 在找不到目标时**静默降级为纯文本**，
 * 写错 slug（少个连字符之类）不会报错，正文里只会少一个链接。
 */
import {
	buildPostsIndex,
	normalizeKey,
	parseWikiTarget,
	resolveTarget,
} from "./lib/posts-index.js";

const argv = process.argv.slice(2);
const noStrict = argv.includes("--no-strict");
const showOrphans = argv.includes("--orphans");

const index = buildPostsIndex();
if (index.posts.length === 0) {
	console.log("没有找到任何文章。");
	process.exit(0);
}

console.log(`共 ${index.posts.length} 篇文章\n`);

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|svg|bmp)$/i;
const wikiRe = /(!?)\[\[([^[\]\n]+)\]\]/g;

/** 编辑距离，用于"你可能想写 X"的智能建议 */
function editDistance(a, b) {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	let prev = Array.from({ length: n + 1 }, (_, i) => i);
	for (let i = 1; i <= m; i += 1) {
		const cur = [i];
		for (let j = 1; j <= n; j += 1) {
			cur[j] = Math.min(
				prev[j] + 1,
				cur[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		prev = cur;
	}
	return prev[n];
}

/** 在所有 slug 里找最接近的一个（阈值按长度放宽） */
function closestSlug(posts, target) {
	const t = normalizeKey(target);
	let best = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const p of posts) {
		const d = editDistance(t, normalizeKey(p.slug));
		if (d < bestDist) {
			bestDist = d;
			best = p;
		}
	}
	if (!best) return null;
	const limit = Math.max(3, Math.ceil(t.length * 0.34));
	return bestDist <= limit ? { post: best, distance: bestDist } : null;
}

let totalLinks = 0;
let broken = 0;
const inbound = new Map(); // slugLower -> 入链次数
for (const p of index.posts) inbound.set(p.slug.toLowerCase(), 0);

/** 逐行扫描，记录行号；跳过代码块内部 */
for (const post of index.posts) {
	const lines = post.text.split(/\r?\n/);
	const problems = [];
	let okCount = 0;
	let inFence = false;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		for (const m of line.matchAll(wikiRe)) {
			const [raw, , inner] = m;
			const { target } = parseWikiTarget(inner);
			if (!target) continue;
			// 图片嵌入不是内链
			if (IMAGE_EXT.test(target)) continue;

			totalLinks += 1;
			const { post: hit } = resolveTarget(index, target, null);
			if (hit) {
				okCount += 1;
				inbound.set(
					hit.slug.toLowerCase(),
					(inbound.get(hit.slug.toLowerCase()) ?? 0) + 1,
				);
			} else {
				broken += 1;
				problems.push({ line: i + 1, raw, target, alias, anchor });
			}
		}
	}

	if (problems.length === 0) {
		if (okCount > 0) console.log(`  ✔ ${post.slug}  （${okCount} 条内链正常）`);
	} else {
		console.log(
			`  ✘ ${post.slug}  （${okCount} 条正常，${problems.length} 条死链）`,
		);
		for (const p of problems) {
			console.log(`      第 ${p.line} 行  ${p.raw}`);
			// 给出最可能的建议：先精确/归一化匹配，再用编辑距离找近似
			const nk = normalizeKey(p.target);
			const exact = index.posts.find(
				(x) => normalizeKey(x.slug) === nk || normalizeKey(x.title) === nk,
			);
			const near = exact ? null : closestSlug(index.posts, p.target);
			if (exact) {
				console.log(
					`        → 你可能是想指向 ${exact.slug}（${exact.title || exact.slug}）`,
				);
			} else if (near) {
				console.log(
					`        → 是不是写错了？最接近的是 ${near.post.slug}（${near.post.title || near.post.slug}）`,
				);
			} else {
				console.log("        → 目标不存在。可用于内链的 slug：");
				for (const x of index.posts.slice(0, 8)) {
					console.log(`            ${x.slug}  （${x.title || x.slug}）`);
				}
			}
		}
	}
}

console.log(`\n合计 ${totalLinks} 条内链，其中 ${broken} 条死链。`);

if (showOrphans) {
	const orphans = index.posts.filter(
		(p) => (inbound.get(p.slug.toLowerCase()) ?? 0) === 0,
	);
	console.log(`\n没有任何入链的文章（${orphans.length} 篇）：`);
	if (orphans.length === 0) console.log("  （无，网状结构良好）");
	for (const p of orphans) console.log(`  ${p.slug}  （${p.title || p.slug}）`);
	if (orphans.length > 1)
		console.log("提示：给它们互相加一条内链，能改善站内导航与 SEO。");
}

if (broken > 0 && !noStrict) {
	console.log(
		"\n提示：死链不会报错，只会在正文里静默变成纯文本。请把上面的 slug 改成右侧建议值。",
	);
	process.exit(1);
}
process.exit(0);
