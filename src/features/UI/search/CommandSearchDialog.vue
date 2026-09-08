<script setup lang="ts">
import { Box, Command, FileText, History, MessageSquare, Package, Search } from "lucide-vue-next";
import { type Component, computed, nextTick, ref, shallowRef, watch } from "vue";
import { Badge, Dialog, DialogContent, DialogTitle } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Conversation } from "@/features/Conversation/chats/chat-types";
import { selectAllChats } from "@/features/Conversation/chats/chat-service";
import { loadContainersForChat, pathForTail } from "@/features/Conversation/messages/message-service";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import { useWorld } from "@/features/Plugin/tree/world-store";
import { initializeWorlds } from "@/features/Plugin/tree/world-store";
import { useCommandStore } from "@/features/Hotkey/command-store";
import { useHotkeyStore } from "@/features/Hotkey/hotkey-store";

type SearchResult = {
	id: string;
	title: string;
	description: string;
	icon: Component;
	hotkey?: string;
	run: () => unknown;
};

const commandStore = useCommandStore();
const hotkeyStore = useHotkeyStore();
const localPlugins = useLocalPluginStore();
const allChats = shallowRef<Conversation[]>([]);
const historyResults = shallowRef<SearchResult[]>([]);
const allMessageResults = shallowRef<SearchResult[]>([]);
const assetResults = shallowRef<SearchResult[]>([]);
const inputRoot = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

const query = computed({
	get: () => commandStore.paletteQuery,
	set: (value: string) => {
		commandStore.paletteQuery = value;
	},
});
const isTagSearch = computed(() =>
	query.value.trim().toLowerCase().startsWith("tag:"),
);
const normalizedQuery = computed(() =>
	(isTagSearch.value ? query.value.trim().slice(4) : query.value)
		.trim()
		.toLowerCase(),
);

const commandResults = computed<SearchResult[]>(() => {
	if (isTagSearch.value) {
		return [];
	}
	const search = normalizedQuery.value;
	return commandStore.commands
		.filter(
			(command) =>
				!search ||
				`${command.title} ${command.description ?? ""} ${command.category}`
					.toLowerCase()
					.includes(search),
		)
		.map((command) => ({
			id: `command:${command.id}`,
			title: command.title,
			description: command.category,
			icon: command.icon ?? Command,
			hotkey: hotkeyStore.getHotkey(command.id),
			run: () => commandStore.executeCommand(command.id),
		}));
});

const packageResults = computed<SearchResult[]>(() => {
	const search = normalizedQuery.value;
	return localPlugins.localPlugins
		.filter((item) =>
			matchesItem(
				[item.name, item.description, item.id],
				search,
				isTagSearch.value,
			),
		)
		.map((item) => ({
			id: `package:${item.id}`,
			title: item.name,
			description: item.description || "角色包",
			icon: Package,
			run: async () => {
				commandStore.closePalette();
			},
		}));
});

const conversationResults = computed<SearchResult[]>(() => {
	const search = normalizedQuery.value;
	return allChats.value
		.filter((item) =>
			matchesItem(
				[item.title, item.id, item.localPluginId],
				search,
				isTagSearch.value,
			),
		)
		.map((item) => ({
			id: `conversation:${item.id}`,
			title: item.title,
			description:
				localPlugins.localPlugins.find(
					(pluginItem) => pluginItem.id === item.localPluginId,
				)?.name ?? "对话",
			icon: MessageSquare,
			run: () => {
				commandStore.closePalette();
			},
		}));
});

const filteredHistoryResults = computed(() => filterSearchResults(historyResults.value));
const filteredAllMessageResults = computed(() => filterSearchResults(allMessageResults.value));
const filteredAssetResults = computed(() => filterSearchResults(assetResults.value));

const sections = computed(() =>
	[
		{ name: "命令", items: commandResults.value },
		{ name: "角色包", items: packageResults.value },
		{ name: "对话", items: conversationResults.value },
		{ name: "当前会话历史", items: filteredHistoryResults.value },
		{ name: "当前会话全部消息", items: filteredAllMessageResults.value },
		{ name: "资产", items: filteredAssetResults.value },
	].filter((section) => section.items.length > 0),
);

const flatResults = computed(() =>
	sections.value.flatMap((section) => section.items),
);

watch(
	() => commandStore.paletteOpen,
	async (open) => {
		if (!open) {
			return;
		}
		await localPlugins.refresh();
		allChats.value = await selectAllChats();
		await refreshCurrentConversationIndex();
		activeIndex.value = 0;
		await nextTick();
		inputRoot.value?.querySelector("input")?.focus();
	},
);

watch(query, () => {
	activeIndex.value = 0;
});

function filterSearchResults(items: SearchResult[]) {
	const search = normalizedQuery.value;
	if (!search) return [];
	return items.filter(item => matchesItem([item.title, item.description], search, false));
}

function textOfContainer(container: Awaited<ReturnType<typeof loadContainersForChat>>[number]) {
	return container.content
		.map((message, index) => `${index + 1}. ${message.content}`)
		.join("\n")
		.trim();
}

async function refreshCurrentConversationIndex() {
	const chatId = commandStore.paletteChatId;
	historyResults.value = [];
	allMessageResults.value = [];
	assetResults.value = [];
	if (!chatId) return;
	const chat = allChats.value.find(item => item.id === chatId);
	if (!chat) return;
	const containers = await loadContainersForChat(chatId);
	const historyIds = new Set(pathForTail(containers, chat.lastContainerId).map(item => item.id));
	const toResult = (container: (typeof containers)[number], history: boolean): SearchResult | null => {
		const text = textOfContainer(container);
		if (!text) return null;
		return { id: `${history ? "history" : "message"}:${container.id}`, title: text.slice(0, 100), description: `${container.role} · ${container.id}`, icon: history ? History : MessageSquare, run: () => commandStore.closePalette() };
	};
	historyResults.value = containers.flatMap(item => historyIds.has(item.id) ? [toResult(item, true)].filter((value): value is SearchResult => Boolean(value)) : []);
	allMessageResults.value = containers.flatMap(item => [toResult(item, false)].filter((value): value is SearchResult => Boolean(value)));
	try {
		await initializeWorlds(chat.localPluginId);
		const world = useWorld({ localPluginId: chat.localPluginId, conversationId: chat.id, applyReplay: true });
		assetResults.value = world.resources.value.map(resource => ({
			id: `asset:${resource.path}`,
			title: resource.file.name,
			description: `${resource.path}\n${typeof resource.file.content === "string" ? resource.file.content.slice(0, 180) : JSON.stringify(resource.file.content).slice(0, 180)}`,
			icon: FileText,
			run: () => commandStore.closePalette(),
		}));
	} catch { /* Search remains useful while a World is still initializing. */ }
}

function matchesItem(
	values: Array<string | undefined | null>,
	search: string,
	tagOnly: boolean,
) {
	if (!search) {
		return true;
	}
	if (tagOnly) {
		return values.some((value) =>
			value
				?.toLowerCase()
				.split(/\s+/)
				.some((part) => part.includes(search)),
		);
	}
	return values.join(" ").toLowerCase().includes(search);
}

function runActive() {
	const item = flatResults.value[activeIndex.value];
	if (item) {
		void item.run();
	}
}

function moveActive(offset: number) {
	if (!flatResults.value.length) {
		return;
	}
	activeIndex.value =
		(activeIndex.value + offset + flatResults.value.length) %
		flatResults.value.length;
}

function isActive(id: string) {
	return flatResults.value[activeIndex.value]?.id === id;
}
</script>

<template>
  <Dialog
    :open="commandStore.paletteOpen"
    @update:open="(open) => open ? commandStore.openPalette(query) : commandStore.closePalette()"
  >
    <DialogContent
      class="top-[18vh] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
      :show-close-button="false"
      @escape-key-down="commandStore.closePalette"
      @interact-outside="commandStore.closePalette"
      @pointer-down-outside="commandStore.closePalette"
    >
      <DialogTitle class="sr-only">搜索或运行命令</DialogTitle>
      <div ref="inputRoot" class="border-b px-4 py-3">
        <div class="relative">
          <Search class="pointer-events-none absolute left-0 top-2.5 size-4 text-muted-foreground" />
          <Input
            v-model="query"
            class="border-0 bg-transparent pl-7 text-base shadow-none focus-visible:ring-0"
            placeholder="搜索命令、角色、会话、消息或资产"
            @keydown.down.prevent="moveActive(1)"
            @keydown.up.prevent="moveActive(-1)"
            @keydown.enter.prevent="runActive"
            @keydown.esc.prevent="commandStore.closePalette"
          />
        </div>
      </div>

      <ScrollArea class="max-h-[62vh]">
        <div v-if="sections.length" class="p-2">
          <section v-for="section in sections" :key="section.name" class="py-1">
            <p class="px-2 py-1 text-xs font-medium text-muted-foreground">{{ section.name }}</p>
            <button
              v-for="item in section.items"
              :key="item.id"
              class="flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-sm"
              :class="isActive(item.id) ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'"
              type="button"
              @mouseenter="activeIndex = flatResults.findIndex((result) => result.id === item.id)"
              @click="item.run"
            >
              <component :is="item.icon || Box" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ item.title }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ item.description }}</span>
              </span>
              <Badge v-if="item.hotkey" variant="secondary" class="shrink-0 font-mono">{{ item.hotkey }}</Badge>
            </button>
          </section>
        </div>
        <div v-else class="px-4 py-10 text-center text-sm text-muted-foreground">
          没有找到匹配项
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>
