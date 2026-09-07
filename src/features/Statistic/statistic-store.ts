import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { selectAllChats } from "@/features/Conversation/chats/chat-service";
import type { Conversation } from "@/features/Conversation/chats/chat-types";
import { selectAllContainers } from "@/features/Conversation/messages/message-service";
import type { ChatMessageContainer } from "@/features/Conversation/messages/message-types";
import { selectAll, upsert } from "@/features/Database/database-service";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import {
	createStatisticEvent,
	createYearHeatmap,
	type StatisticEvent,
} from "./statistic";

const table = "statistic_events";

export const useStatisticStore = defineStore("statistic", () => {
	const events = ref<StatisticEvent[]>([]);
	const loaded = ref(false);
	const localPlugins = useLocalPluginStore();
	const allChats = shallowRef<Conversation[]>([]);
	const allContainers = shallowRef<ChatMessageContainer[]>([]);

	const packageCount = computed(() => localPlugins.localPlugins.length);
	const conversationCount = computed(() => allChats.value.length);
	const messageCount = computed(() =>
		allContainers.value.reduce(
			(total, container) => total + container.content.length,
			0,
		),
	);
	const heatmap = computed(() => createYearHeatmap(events.value));
	const sizeByType = computed(() => {
		const conversationsBytes = byteSize(allChats.value);
		const containersBytes = byteSize(allContainers.value);
		const packagesBytes = byteSize(localPlugins.localPlugins);
		return [
			{
				id: "packages",
				label: "角色包",
				bytes: packagesBytes,
				color: "var(--chart-1)",
			},
			{
				id: "conversations",
				label: "对话",
				bytes: conversationsBytes,
				color: "var(--chart-2)",
			},
			{
				id: "messages",
				label: "消息",
				bytes: containersBytes,
				color: "var(--chart-3)",
			},
		];
	});
	const sizeByPackage = computed(() =>
		localPlugins.localPlugins.map((item, index) => {
			const pkgConversations = allChats.value.filter(
				(conversationItem) => conversationItem.localPluginId === item.id,
			);
			const conversationIds = new Set(
				pkgConversations.map((conversationItem) => conversationItem.id),
			);
			const pkgContainers = allContainers.value.filter((container) =>
				conversationIds.has(container.conversationid),
			);
			return {
				id: item.id,
				label: item.name,
				bytes:
					byteSize(item) +
					byteSize(pkgConversations) +
					byteSize(pkgContainers),
				color: `hsl(${(index * 67) % 360} 70% 55%)`,
			};
		}),
	);

	async function initialize() {
		if (loaded.value) {
			return;
		}
		events.value = (await selectAll<StatisticEvent>(table)).map(
			(item) => item.value,
		);
		allChats.value = await selectAllChats();
		allContainers.value = await selectAllContainers();
		loaded.value = true;
	}

	async function recordEvent(type: StatisticEvent["type"]) {
		await initialize();
		const event = createStatisticEvent(type);
		events.value.push(event);
		await upsert(table, event.id, event);
	}

	function recordAppLaunch() {
		return recordEvent("app.launch");
	}

	return {
		events,
		loaded,
		heatmap,
		packageCount,
		conversationCount,
		messageCount,
		sizeByPackage,
		sizeByType,
		initialize,
		recordEvent,
		recordAppLaunch,
	};
});

function byteSize(value: unknown) {
	return new Blob([JSON.stringify(value)]).size;
}
