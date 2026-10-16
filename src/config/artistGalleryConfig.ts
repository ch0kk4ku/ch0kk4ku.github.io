import artistsData from "@/data/artists.json";
import type { ArtistGalleryConfig } from "../types/artistGalleryConfig";

// 「关于我」页面的常听音乐人卡片长廊
export const artistGalleryConfig: ArtistGalleryConfig = {
	// 是否启用（关闭后关于页不渲染该长廊，组件与数据都保留，改回 true 即可恢复）
	enable: false,

	// 分组标题，留空则不显示标题行
	title: "常听音乐人",

	// 标题右侧的提示文字
	note: "轻点卡片翻面，看看我常听什么",

	// 数据说明：
	// 歌手信息与推荐歌曲来自 src/data/artists.json，由 `pnpm artists` 抓取/更新；
	// 其中 picks（推荐歌曲）可手工编辑，重新抓取不会被覆盖。
	// 想只展示部分歌手，把不要的条目从 artists.json 里删掉即可。
	data: artistsData,
};
