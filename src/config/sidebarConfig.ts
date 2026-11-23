import type { SidebarConfig } from "@/types/sidebarConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

const ALL_PAGES = [
	"home",
	"archive",
	"friends",
	"moments",
	"anime",
	"compass",
	"skills",
	"projects",
	"devices",
	"games",
	"timeline",
	"albums",
	"about",
	"post",
];

export const sidebarConfig: SidebarConfig = withUserConfig("sidebar", {
	enable: true,
	arrangement: "dual",
	side: "left",
	components: [
		// 左侧主栏：头像资料卡（音乐播放器由 CSS 合并进这张卡）
		{ type: "profile", enable: true, slot: "top" },
		{ type: "music", enable: true, slot: "top" },
		{ type: "announcement", enable: true, slot: "top", pages: ["home"] },

		// 右侧副栏：数据总览（统计 + 系列 + 标签 + 分类全部合并）
		{
			type: "overview",
			enable: true,
			slot: "top",
			column: "secondary",
			pages: ALL_PAGES,
		},
		{
			type: "toc",
			enable: true,
			slot: "sticky",
			column: "secondary",
			pages: ["post"],
		},

		// 已合并进 overview，单独关闭
		{ type: "categories", enable: false },
		{ type: "stats", enable: false },
		{ type: "series", enable: false },
		{ type: "tags", enable: false },
		{ type: "calendar", enable: false },
	],
});