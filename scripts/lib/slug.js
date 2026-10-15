/**
 * 共用小工具：把标题/文件名转成 URL 友好的 slug。
 *
 * 中文会转成拼音（与 pnpm new-post 的行为一致），例如：
 *   "测试文章名称" -> "ce-shi-wen-zhang-ming-cheng"
 *   "TSCTF-J2026 Writeup" -> "tsctf-j2026-writeup"
 */
import { pinyin } from "pinyin-pro";

const HAN = /[\u4e00-\u9fff]/;

/** 单个路径片段转 slug（中文转拼音，其余字符保留字母数字与连字符） */
export function slugifySegment(segment) {
	if (!HAN.test(segment)) {
		return segment
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
	}

	const parts = [];
	let buffer = "";
	for (const char of segment) {
		if (HAN.test(char)) {
			if (buffer) {
				parts.push(buffer);
				buffer = "";
			}
			parts.push(pinyin(char, { toneType: "none", type: "array" })[0]);
		} else {
			buffer += char;
		}
	}
	if (buffer) parts.push(buffer);

	return parts
		.join("-")
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

/** 整个路径转 slug，保留 "/" 分层结构 */
export function slugifyPath(pathLike) {
	return pathLike
		.split("/")
		.map((segment) => slugifySegment(segment))
		.filter(Boolean)
		.join("/");
}
