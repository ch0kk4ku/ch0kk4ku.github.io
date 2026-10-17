/**
 * 歌手卡片长廊的数据结构。
 * 数据由 `pnpm artists`（scripts/fetch-artists.mjs）生成到 src/data/artists.json，
 * 其中 picks（推荐歌曲）可以手工编辑，重新抓取时不会被覆盖。
 */
export type ArtistEntry = {
	key: string; // 固定标识，同时是图片文件名
	name: string; // 显示名（如「DAZBEE」）
	alias: string; // 别名，作为卡片副标题（如「Vae」「小刚」）
	photo: string; // 图片路径（public 下，如 /artists/xu-song.webp）
	artistId: number; // 音乐平台歌手 ID
	picks: string[]; // 推荐歌曲（背面展示）
};
