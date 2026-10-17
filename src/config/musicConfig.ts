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
		// 选型依据（均实测）：
		//   · 主题默认的 https://api.i-meto.com/meting/api 已失效（返回 401 服务器未知异常）
		//   · api.injahow.cn 可用，但**歌单有服务端缓存**：改了歌单后台仍返回旧列表（实测 7 首 vs 8 首）
		//   · api.moeyao.cn 可用且能及时反映歌单改动 → 作为主 API
		// 末尾的 &r=:r 是缓存击穿参数（播放器会把 :r 替换成随机数），主题原本就有，这里保留
		api: "https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "tencent",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		// 注意：QQ 音乐（tencent）不支持 search 与 artist，歌单/单曲/专辑可用
		type: "playlist",
		// 歌单 ID（QQ 音乐）
		// 实测：8 首歌曲均能解析出完整音频，且都带歌词与封面
		id: "9793910675",
		// 认证 token（可选）。公开 API 不使用它；只有自建 Meting-API 支持 VIP 时才需要
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		// injahow 作为兜底（它有缓存，所以不当主用）；i-meto 已失效、meting.js.org 返回 404，故不列入
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id&r=:r",
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
