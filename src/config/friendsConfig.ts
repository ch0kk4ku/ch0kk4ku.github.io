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
// 当前为空：页面仍然可用，但不会展示任何友链卡片。
// 添加友链时按下面的结构往数组里追加一项即可：
//
//	{
//		title: "朋友的站点名",
//		imgurl: "https://朋友的站点/avatar.png",
//		desc: "一句话介绍",
//		siteurl: "https://朋友的站点",
//		tags: ["Blog"],
//		weight: 10,        // 权重，数字越大排序越靠前
//		enabled: true,     // false 则隐藏但保留配置
//	},
export const friendsConfig: FriendLink[] = [];

// 获取启用的友链并进行排序
export const getEnabledFriends = (): FriendLink[] => {
	const friends = friendsConfig.filter((friend) => friend.enabled);

	if (friendsPageConfig.randomizeSort) {
		return friends.sort(() => Math.random() - 0.5);
	}

	return friends.sort((a, b) => b.weight - a.weight);
};
