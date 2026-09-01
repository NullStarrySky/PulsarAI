import { defineConfig } from "vitepress";

export default defineConfig({
	lang: "zh-CN",
	title: "PulsarAI",
	description: "PulsarAI 的系统设计、项目思路与 API 文档",
	cleanUrls: true,
	lastUpdated: true,
	markdown: {
		lineNumbers: true,
	},
	themeConfig: {
		nav: [
			{ text: "系统设计", link: "/design/overview" },
			{ text: "项目思路", link: "/design/thinking" },
			{ text: "API", link: "/api/" },
		],
		sidebar: {
			"/design/": [
				{
					text: "设计",
					items: [
						{ text: "系统设计概览", link: "/design/overview" },
						{ text: "项目思路", link: "/design/thinking" },
					],
				},
				{
					text: "参考",
					items: [{ text: "API 文档", link: "/api/" }],
				},
			],
			"/api/": [
				{
					text: "API",
					items: [
						{ text: "API 文档", link: "/api/" },
						{ text: "运行环境", link: "/api/environment" },
						{ text: "Plugin 资源", link: "/api/resources" },
						{ text: "Agent 与 CodeAct", link: "/api/agent" },
						{ text: "Host", link: "/api/host" },
						{ text: "核心类型", link: "/api/types" },
					],
				},
				{
					text: "设计背景",
					items: [
						{ text: "系统设计概览", link: "/design/overview" },
						{ text: "项目思路", link: "/design/thinking" },
					],
				},
			],
		},
		search: {
			provider: "local",
		},
		outline: {
			level: [2, 3],
			label: "本页目录",
		},
		docFooter: {
			prev: "上一页",
			next: "下一页",
		},
		lastUpdated: {
			text: "最后更新",
			formatOptions: {
				dateStyle: "medium",
				timeStyle: "short",
			},
		},
		returnToTopLabel: "返回顶部",
		sidebarMenuLabel: "目录",
		darkModeSwitchLabel: "外观",
		lightModeSwitchTitle: "切换到浅色模式",
		darkModeSwitchTitle: "切换到深色模式",
	},
});
