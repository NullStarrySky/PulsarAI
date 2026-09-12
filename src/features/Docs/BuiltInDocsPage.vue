<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import ConversationMarkdown from "@/features/Conversation/stage/markstream/ConversationMarkdown.vue";
import pluginDocs from "@/features/Plugin/docs.md?raw";
import dataFlowDocs from "../../../dataFlow.md?raw";

const chapters = [
	{
		id: "thinking",
		name: "思路",
		pages: [
			{
				id: "architecture",
				name: "基本架构",
				content:
					"# 基本架构\n\nPulsar 以 World、Conversation 与稳定 Host facade 作为三条正交边界。静态资源保存在 World；发生过的消息、Pulse 与 Interval 保存在 Conversation；平台能力只从 Host 进入。",
			},
			{ id: "data-flow", name: "数据流", content: dataFlowDocs },
			{ id: "plugin", name: "插件与 World", content: pluginDocs },
		],
	},
	{
		id: "ui",
		name: "界面控制",
		pages: [
			{
				id: "composer",
				name: "输入与引用",
				content:
					"# 输入与引用\n\n- `@` 引用 World 文件或当前路径中的消息，并作为特殊附件发送。\n- `/` 搜索并执行 `COMMAND` 插槽里的命令。\n- `Ctrl+Shift+E` 切换内置编辑子对话；模式按钮也可进入插件提供的自定义模式。",
			},
			{
				id: "assets",
				name: "资源树与浮窗",
				content:
					"# 资源树与浮窗\n\n资源树展示 `/self` 与 `/global`。点击文件会在可移动浮窗中打开；右下角 token 数量是本地参考值，不包含递归展开、条件与插槽带来的最终变化。",
			},
			{
				id: "settings",
				name: "设置",
				content:
					"# 设置\n\n设置页管理热键、模型、外观、备份和各媒体服务。窄窗口下导航会切换为抽屉布局。",
			},
		],
	},
	{
		id: "api",
		name: "API 文档",
		pages: [
			{
				id: "world-api",
				name: "World API",
				content:
					"# World API\n\n`read/write/edit/ls/exists/mkdir/move/copy/remove` 只通过 `useWorld` 与 Sandbox 的同名 facade 使用。稳定路径使用 `/$<nodeId>`，源码中的 `@/` 始终相对当前来源根。",
			},
			{
				id: "slot-api",
				name: "插槽与模式",
				content:
					'# 插槽与模式\n\n插件向 `/self/slot/MODE` 注册 JSON：\n\n```json\n{ "id": "review", "name": "审阅模式", "enter": "/self/modes/review-enter.js", "exit": "/self/modes/review-exit.js" }\n```\n\n进入与退出脚本在当前 Conversation World 环境中运行。',
			},
			{
				id: "host-api",
				name: "Host API",
				content:
					"# Host API\n\nRenderer 只从 `@/host` 使用平台能力。桌面更新位于 `host.desktop.update`，包含 `check()`、`download()`、`install()` 与事件监听；移动端不会暴露桌面更新空实现。",
			},
		],
	},
] as const;

const activeChapterId = ref<(typeof chapters)[number]["id"]>("thinking");
const activePageId = ref("architecture");
const activeChapter = computed(
	() =>
		chapters.find((item) => item.id === activeChapterId.value) ?? chapters[0],
);
const activePage = computed(
	() =>
		activeChapter.value.pages.find((item) => item.id === activePageId.value) ??
		activeChapter.value.pages[0],
);
function selectChapter(id: (typeof chapters)[number]["id"]) {
	activeChapterId.value = id;
	activePageId.value =
		chapters.find((item) => item.id === id)?.pages[0].id ?? "";
}
</script>

<template>
  <div class="grid h-full min-h-0 grid-cols-[9rem_11rem_minmax(0,1fr)] mobile:grid-cols-[7rem_minmax(0,1fr)]">
    <nav class="border-r p-2">
      <Button v-for="chapter in chapters" :key="chapter.id" class="mb-1 w-full justify-start" :variant="activeChapter.id === chapter.id ? 'secondary' : 'ghost'" @click="selectChapter(chapter.id)">{{ chapter.name }}</Button>
    </nav>
    <nav class="border-r p-2 mobile:hidden">
      <Button v-for="page in activeChapter.pages" :key="page.id" class="mb-1 w-full justify-start" :variant="activePage.id === page.id ? 'secondary' : 'ghost'" @click="activePageId = page.id">{{ page.name }}</Button>
    </nav>
    <ScrollArea class="min-h-0"><article class="mx-auto max-w-3xl px-7 py-6 mobile:px-4"><div class="mb-3 hidden flex-wrap gap-1 mobile:flex"><Button v-for="page in activeChapter.pages" :key="page.id" size="sm" :variant="activePage.id === page.id ? 'secondary' : 'ghost'" @click="activePageId = page.id">{{ page.name }}</Button></div><ConversationMarkdown :content="activePage.content" /></article></ScrollArea>
  </div>
</template>
