import type { MusicPlayerConfig } from "../types/musicConfig";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口（右上角音符按钮，点开浮层面板）
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	showInSidebar: false,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	mode: "meting",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: true,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// ⚠️ 主题原本默认的 https://api.i-meto.com/meting/api 实测已失效（返回 401 服务器未知异常），
		//    故改用实测可用的 injahow；下面 fallbackApis 里的端点也逐个验证过。
		api: "https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "tencent",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		// 注意：QQ 音乐（tencent）不支持 search 与 artist，歌单/单曲/专辑可用
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		// ⚠️ 这是主题自带的示例歌单（网易云），换成你自己的 QQ 音乐歌单 ID
		id: "7962235716",
		// 认证 token（可选）。公开 API 不使用它；只有自建 Meting-API 支持 VIP 时才需要
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		// 已实测：moeyao 可用；i-meto 失效、meting.js.org 返回 404，故不再列入
		fallbackApis: [
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		playlist: [
			{
				name: "使一颗心免于哀伤",
				artist: "知更鸟 / HOYO-MiX / Chevy",
				url: "/assets/music/使一颗心免于哀伤-哼唱.mp3",
				cover: "/assets/music/cover/109951169585655912.webp",
				lrc: "",
			},
		],
	},
};
