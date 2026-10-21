import type { FriendLink, FriendsPageConfig } from "../types/friendsConfig";

// 可以在src/content/spec/friends.md中编写友链页面下方的自定义内容

// 友链页面配置
export const friendsPageConfig: FriendsPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 是否显示底部自定义内容（friends.mdx 中的内容）
	showCustomContent: true,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: true,

	// 是否开启随机排序配置，如果开启，就会忽略权重，构建时进行一次随机排序
	randomizeSort: false,
};

// 友链配置
// 当前为空：页面仍然可用（只显示本站信息卡片），但不会展示任何友链卡片。
//
// 添加友链 = 往下面的数组里追加一项，保存后重新构建即可。字段含义：
//
//	{
//		title: "朋友的站点名",                       // 卡片标题
//		imgurl: "https://朋友的站点/avatar.png",     // 头像/Logo，必须是完整 URL 或以 / 开头的路径
//		desc: "一句话介绍",                          // 卡片描述
//		siteurl: "https://朋友的站点",               // 点击卡片跳转的地址
//		tags: ["Blog"],                              // 分类标签，数组，可写多个
//		weight: 10,                                  // 权重，数字越大排序越靠前
//		enabled: true,                               // 设为 false 可隐藏但保留配置
//	},
//
// 多条友链就写多个对象，用逗号分隔，例如：
//
//	{ title: "A 的博客", imgurl: "https://a.com/avatar.png", desc: "A", siteurl: "https://a.com", tags: ["Blog"], weight: 10, enabled: true },
//	{ title: "B 的博客", imgurl: "https://b.com/avatar.png", desc: "B", siteurl: "https://b.com", tags: ["Blog"], weight: 8, enabled: true },
export const friendsConfig: FriendLink[] = [
	{
		title: "Ch0kk4ku's CNBlog",
		imgurl: "/friends/ch0kk4ku-s-cnblog.png",
		desc: "我的旧博客。",
		siteurl: "https://www.cnblogs.com/ch0kk4ku",
		tags: ["Blog"],
		weight: 10,
		enabled: true,
	},
	{
		title: "圆周率的废纸堆",
		imgurl: "/friends/yuan-zhou-l-de-fei-zhi-dui.png",
		desc: "圆周率的废纸堆，里面或许有你需要的？",
		siteurl: "https://piyuanzhoulv.github.io/",
		tags: ["Blog"],
		weight: 20,
		enabled: true,
	},
	{
		title: "Dalang",
		imgurl: "/friends/dalang.webp",
		desc: "一些半夜发疯想的东西和一些记录等等。",
		siteurl: "https://xiaolang0817.github.io/personal_blog/",
		tags: ["Blog"],
		weight: 12,
		enabled: true,
	},
	{
		title: "yuanmuyan",
		imgurl: "/friends/yuanmuyan.webp",
		desc: "CERT-EU 名人堂在榜巨佬。",
		siteurl: "https://yuanmuyan.github.io/",
		tags: ["Blog"],
		weight: 12,
		enabled: true,
	},
	{
		title: "宛宛",
		imgurl: "/friends/wan-wan.png",
		desc: "人生五十年，如梦亦如幻。",
		siteurl: "https://blog.3w3.asia/",
		tags: ["Blog"],
		weight: 12,
		enabled: true,
	},
	{
		title: "KA’s Blog",
		imgurl: "/friends/ka-s-blog.png",
		desc: "Pwn 大手子。",
		siteurl: "https://kioroshiaki.github.io/",
		tags: ["Blog"],
		weight: 15,
		enabled: true,
		shape: "circle",
	},
	{
		title: "Map1e-Suk1",
		imgurl: "/friends/map1e-suk1.webp",
		desc: "Roam free, for life is wide.",
		siteurl: "https://map1e-suk1.github.io/",
		tags: ["Blog"],
		weight: 12,
		enabled: true,
	},
	{
		title: "kur0sia!",
		imgurl: "/friends/kur0sia.jpg",
		desc: "Ciallo～(∠・ω< )⌒★",
		siteurl: "https://aclosure.github.io/links/",
		tags: ["Blog"],
		weight: 12,
		enabled: true,
	},
	{
		title: "Miso Blog",
		imgurl: "/friends/miso-blog.png",
		desc: "让梦想起飞的不是鸡翅，而是少年气。",
		siteurl: "https://miso2233.github.io/",
		tags: ["Blog"],
		weight: 15,
		enabled: true,
	},
];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
