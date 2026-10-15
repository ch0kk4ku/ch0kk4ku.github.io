import type { AnalyticsConfig } from "../types/analyticsConfig";

// 统计分析配置（全部留空 = 不加载任何第三方统计脚本）
// ⚠️ 这里只是配置位：只有填了 ID 才会真正开始上报数据。
// 下面这些开关是「一旦填了 ID 就会生效」的隐私相关项，已统一关闭。
export const analyticsConfig: AnalyticsConfig = {
	// Google Analytics ID
	googleAnalyticsId: "",
	// Microsoft Clarity ID
	microsoftClarityId: "",
	// Umami 统计配置
	umamiAnalytics: {
		// Umami Website ID
		websiteId: "",
		// Umami JS地址，支持使用自建
		scriptUrl: "https://cloud.umami.is/script.js",
		// Umami 会话回放脚本地址，支持使用自建
		replaysScriptUrl: "https://cloud.umami.is/recorder.js",
		// 是否追踪出站链接（会记录访客点了哪些外部链接）
		trackOutboundLinks: false,
		// 是否收集浏览器性能指标
		collectWebVitals: false,
		// 会话回放（等于给访客录屏，隐私风险高，默认关闭）
		replays: {
			enabled: false,
			sampleRate: 0.15,
			maskLevel: "strict",
			maxDuration: 300000,
			blockSelector: "",
		},
	},
	// 51la 统计配置
	// 上游模板里这里默认开启了「录屏」与「事件分析」，属于过度采集，故整块留空且不再启用。
	// 如需使用，请自行填写 Id，并把 autoTrack / screenRecord 保持为 false。
	la51Analytics: {
		Id: "",
		sdkUrl: "",
		ck: "",
		autoTrack: false,
		hashMode: false,
		// 网站录屏：会把访客的会话录下来，默认关闭
		screenRecord: false,
	},
};
