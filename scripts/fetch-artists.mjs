/**
 * 抓取「关于我」歌手卡片长廊所需的素材：歌手信息 + 别名 + 热门歌曲 + 压缩头像。
 *
 * 用法：
 *   pnpm artists              抓取全部歌手（已存在的图片会跳过下载）
 *   pnpm artists --force      强制重新下载图片
 *   pnpm artists --dry-run    只打印，不写任何文件
 *
 * 设计要点：
 *  1. 只用一次性脚本，绝不在构建流程里调用外部接口
 *     （网易云接口实测有频率限制，连续请求会返回 406 操作频繁）
 *  2. **保留手工编辑**：重新抓取时，artists.json 里已存在的 picks（推荐歌曲）
 *     不会被接口数据覆盖；只有接口取回的数据用于填充缺失/新增字段
 *  3. 图片统一裁成方形并压成 webp，落盘到 public/artists/
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DATA_FILE = path.resolve("src/data/artists.json");
const IMG_DIR = path.resolve("public/artists");

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const DRY = argv.includes("--dry-run");

/** 要抓取的歌手：key 为固定标识（文件名/数据键），query 为搜索关键词 */
// 只抓正文里提到的这 5 位（鎖那、鹿乃 已从正文移除，不再生成卡片）
const ARTISTS = [
	{ key: "xu-song", query: "许嵩" },
	{ key: "zhang-yu-sheng", query: "张雨生" },
	{ key: "fang-da-tong", query: "方大同" },
	{ key: "zhou-chuan-xiong", query: "周传雄" },
	{ key: "dazbee", query: "Dazbee" },
];

const PHOTO_SIZE = 480; // 卡片显示约 153px，2x/3x 屏 480 足够
const PICKS_PER_ARTIST = 4;
const TIMEOUT = 25000;
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带限流退避的 GET：遇到 406「操作频繁」自动等待重试 */
async function getJson(url, { retries = 5, baseDelay = 15000 } = {}) {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const r = await fetch(url, {
				headers: { "User-Agent": UA, Referer: "https://music.163.com/" },
				signal: AbortSignal.timeout(TIMEOUT),
			});
			const text = await r.text();
			let json = null;
			try {
				json = JSON.parse(text);
			} catch {}
			// 限流
			if (json?.code === 406) {
				const wait = baseDelay * attempt;
				console.log(
					`      ⏳ 触发限流，等待 ${(wait / 1000).toFixed(0)}s 后重试（第 ${attempt}/${retries} 次）`,
				);
				await sleep(wait);
				continue;
			}
			if (!json) {
				console.log(`      ⚠ 非 JSON 响应：${text.slice(0, 80)}`);
				return null;
			}
			return json;
		} catch (e) {
			console.log(
				`      ⚠ 请求失败（${e.message}），第 ${attempt}/${retries} 次`,
			);
			await sleep(baseDelay);
		}
	}
	return null;
}

/** 搜索歌手，返回第一个匹配的歌手对象 */
async function searchArtist(query) {
	const url = `https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(query)}&type=100&offset=0&total=true&limit=5`;
	const json = await getJson(url);
	return (json?.result?.artists ?? [])[0] ?? null;
}

/** 取该歌手的热门歌曲（按热度排序的前 N 首） */
async function topSongs(artistId, limit = PICKS_PER_ARTIST) {
	const url = `https://music.163.com/api/artist/top/song?id=${artistId}&limit=${limit}`;
	const json = await getJson(url, { retries: 3 });
	const songs = json?.songs ?? [];
	// 按 popularity 降序（接口偶尔不排序）
	const sorted = [...songs].sort(
		(a, b) => (b.pop ?? b.popularity ?? 0) - (a.pop ?? a.popularity ?? 0),
	);
	const names = [];
	for (const s of sorted) {
		const name = String(s.name ?? "").trim();
		if (name && !names.includes(name)) names.push(name);
		if (names.length >= limit) break;
	}
	return names;
}

/** 下载头像并处理成方形 webp */
async function fetchPhoto(picUrl, key) {
	const outFile = path.join(IMG_DIR, `${key}.webp`);
	if (fs.existsSync(outFile) && !FORCE) {
		return {
			file: `/artists/${key}.webp`,
			skipped: true,
			bytes: fs.statSync(outFile).size,
		};
	}
	const src = String(picUrl).split("?")[0];
	const r = await fetch(src, {
		headers: { "User-Agent": UA, Referer: "https://music.163.com/" },
		signal: AbortSignal.timeout(TIMEOUT),
	});
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	const buf = Buffer.from(await r.arrayBuffer());
	const meta = await sharp(buf).metadata();
	// 接口图片多为 1.2:1 横图，方形裁切 + 顶部对齐以保住人脸
	const out = await sharp(buf)
		.resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover", position: "top" })
		.webp({ quality: 82 })
		.toBuffer();
	if (!DRY) {
		fs.mkdirSync(IMG_DIR, { recursive: true });
		fs.writeFileSync(outFile, out);
	}
	return {
		file: `/artists/${key}.webp`,
		skipped: false,
		from: `${meta.width}×${meta.height} ${meta.format} ${(buf.length / 1024).toFixed(0)} KB`,
		bytes: out.length,
	};
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

console.log("抓取歌手素材（接口有频率限制，每步之间会等待）\n");

// 读入已有数据：用于保留手工编辑过的 picks
let existing = [];
if (fs.existsSync(DATA_FILE)) {
	try {
		existing = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
		console.log(
			`已读取现有数据：${existing.length} 位（其中的推荐歌曲将保留）\n`,
		);
	} catch {
		console.log("⚠ 现有 artists.json 无法解析，将重建\n");
	}
}
const existingByKey = new Map(existing.map((a) => [a.key, a]));

const results = [];
for (const { key, query } of ARTISTS) {
	console.log(`── ${query} ──`);
	const before = existingByKey.get(key);

	const artist = await searchArtist(query);
	if (!artist) {
		console.log("  ✘ 未找到，跳过");
		if (before) results.push(before);
		await sleep(4000);
		continue;
	}
	console.log(
		`  ✔ ${artist.name}（别名：${(artist.alias ?? []).join(" / ") || "无"}）id=${artist.id}`,
	);

	let photo = null;
	try {
		photo = await fetchPhoto(artist.picUrl, key);
		console.log(
			photo.skipped
				? `  · 图片已存在，跳过（${(photo.bytes / 1024).toFixed(1)} KB）—— 用 --force 可重新下载`
				: `  · 图片 ${photo.from} → 方形 ${PHOTO_SIZE}×${PHOTO_SIZE} webp ${(photo.bytes / 1024).toFixed(1)} KB`,
		);
	} catch (e) {
		console.log(`  ✘ 图片失败：${e.message}`);
	}

	await sleep(3000);
	const picks = await topSongs(artist.id);
	console.log(`  · 热门歌曲：${picks.join("、") || "（未取到）"}`);

	// 手工编辑优先：已有 picks 且非空时保留
	const keptPicks =
		Array.isArray(before?.picks) && before.picks.length > 0
			? before.picks
			: null;
	if (keptPicks)
		console.log(`  · 保留你已编辑的推荐歌曲：${keptPicks.join("、")}`);
	else if (picks.length === 0 && before?.picks?.length)
		console.log("  · 接口未返回歌曲，沿用旧值");

	results.push({
		key,
		name: artist.name ?? query,
		alias: (artist.alias ?? [])[0] ?? "",
		photo: photo?.file ?? before?.photo ?? "",
		artistId: artist.id,
		picks: keptPicks ?? (picks.length > 0 ? picks : (before?.picks ?? [])),
	});

	await sleep(4000);
}

if (DRY) {
	console.log("\n--dry-run：以下内容未写入文件\n");
	console.log(JSON.stringify(results, null, "\t"));
} else {
	fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
	// 用 tab 缩进 + 末尾换行：与 Biome 的格式化结果一致，
	// 避免「重新抓取 → 又被 biome format 改动」的来回 diff
	fs.writeFileSync(DATA_FILE, `${JSON.stringify(results, null, "\t")}\n`);
	console.log(
		`\n✔ 已写入 ${path.relative(process.cwd(), DATA_FILE)}（${results.length} 位歌手）`,
	);
	console.log(`  图片目录：${path.relative(process.cwd(), IMG_DIR)}`);
	console.log(
		"\n提示：想换成自己推荐的歌曲，直接编辑 artists.json 里各条目的 picks 数组即可；",
	);
	console.log("      之后再跑 pnpm artists 不会覆盖你改过的 picks。");
}
