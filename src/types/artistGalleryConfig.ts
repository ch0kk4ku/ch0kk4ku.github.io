import type { ArtistEntry } from "./artists";

/** 「关于我」页面常听音乐人卡片长廊的配置 */
export type ArtistGalleryConfig = {
	enable: boolean; // 是否启用
	title?: string; // 分组标题，留空则不显示
	note?: string; // 标题右侧提示文字
	data: ArtistEntry[]; // 歌手数据（来自 src/data/artists.json）
};
