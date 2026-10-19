/**
 * 文章索引：给「内链校验」与「导入时的内链映射」共用。
 *
 * 关键：主题的 remark-wiki-link 插件按 **文件路径 / frontmatter.slug** 解析内链，
 * 不按标题解析。所以这里同时建两份索引：
 *   - bySlug：内链合法目标（文件名或 frontmatter.slug）
 *   - byTitle：仅用于"帮用户把标题映射成 slug"，直接写标题在内链里是不生效的
 */
import fs from "node:fs";
import path from "node:path";

const POSTS_DIR = path.resolve("src/content/posts");

/** 归一化：去括号前缀、小写、去掉标点与空白，便于宽松比对 */
export function normalizeKey(value) {
	return String(value)
		.replace(/^[（(【[]\s*[^）)】\]]{1,12}\s*[）)】\]]\s*/, "")
		.toLowerCase()
		.replace(/[\s\-_·.,，。!！?？:：;；'"`"''()（）[\]【】<>《》/\\|#]/g, "");
}

function readFrontmatterField(text, key) {
	const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
	if (!m) return "";
	return m[1].trim().replace(/^["']|["']$/g, "");
}

/** 构建索引 */
export function buildPostsIndex() {
	if (!fs.existsSync(POSTS_DIR))
		return { posts: [], bySlug: new Map(), byTitle: new Map() };

	const files = fs
		.readdirSync(POSTS_DIR, { recursive: true })
		.filter((f) => typeof f === "string" && /\.(md|mdx)$/i.test(f))
		.map((f) => String(f).split(path.sep).join("/"));

	const posts = files.map((rel) => {
		const full = path.join(POSTS_DIR, rel);
		const text = fs.readFileSync(full, "utf8");
		const declaredSlug = readFrontmatterField(text, "slug");
		const contentPath = rel.replace(/\.(md|mdx)$/i, "");
		const slug = declaredSlug || contentPath;
		return {
			rel,
			full,
			slug,
			title: readFrontmatterField(text, "title"),
			text,
		};
	});

	const bySlug = new Map();
	const byTitle = new Map();
	for (const p of posts) {
		bySlug.set(p.slug.toLowerCase(), p);
		// 文件名（不含目录）也允许直接命中，贴近 Obsidian 的"按名字找"
		const base = p.slug.split("/").pop() ?? p.slug;
		bySlug.set(base.toLowerCase(), p);
		if (p.title) {
			byTitle.set(p.title.toLowerCase(), p);
			const nk = normalizeKey(p.title);
			if (nk) byTitle.set(nk, p);
		}
		const nkRel = normalizeKey(p.slug);
		if (nkRel) byTitle.set(nkRel, p);
	}
	return { posts, bySlug, byTitle };
}

/** 解析 [[目标|别名#小节]] 内部字符串 */
export function parseWikiTarget(inner) {
	const [targetWithAnchor, ...rest] = inner.split("|");
	const alias = rest.join("|").trim();
	const [target, ...anchorParts] = targetWithAnchor.split("#");
	return {
		target: target.trim(),
		anchor: anchorParts.join("#").trim(),
		alias,
	};
}

/** 找一个内链目标对应的文章：先按 slug，再按标题归一化宽松匹配 */
export function resolveTarget(index, target, explicitMap) {
	if (explicitMap?.has(target.toLowerCase())) {
		return {
			post: index.bySlug.get(explicitMap.get(target.toLowerCase())),
			via: "映射表",
		};
	}
	const direct = index.bySlug.get(target.toLowerCase());
	if (direct) return { post: direct, via: "slug" };

	const byTitle = index.byTitle.get(target.toLowerCase());
	if (byTitle) return { post: byTitle, via: "标题" };

	const nk = normalizeKey(target);
	const byNorm = index.byTitle.get(nk);
	if (byNorm) return { post: byNorm, via: "标题(模糊)" };

	return { post: null, via: "" };
}
