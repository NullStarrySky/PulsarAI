<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from "vue";
import { Button } from "@/components/fluid";
import type {
	ChatContainer as ChatMessageContainer,
	ChatMeta as Conversation,
} from "@/features/Conversation/dataflow/types";
import { selectAll } from "@/features/Database/database-service";
import { useSyncStore } from "@/features/Database/dbsync-store";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";

interface StatisticEvent {
	id: string;
	type: "app.launch" | "message.user" | "message.assistant";
	createdAt: string;
}

interface HeatmapDay {
	date: string;
	count: number;
}

const diskMode = ref<"type" | "package">("type");
const events = ref<StatisticEvent[]>([]);
const loaded = ref(false);
const sync = useSyncStore();
const allChats = shallowRef<Conversation[]>([]);
const allContainers = shallowRef<ChatMessageContainer[]>([]);

const localPlugins = computed(() => [...sync.characters]);
const packageCount = computed(() => localPlugins.value.length);
const conversationCount = computed(() => allChats.value.length);
const messageCount = computed(() =>
	allContainers.value.reduce(
		(total, container) => total + container.content.length,
		0,
	),
);

function createYearHeatmap(
	eventList: StatisticEvent[],
	today = new Date(),
): HeatmapDay[] {
	const start = new Date(today);
	start.setDate(start.getDate() - 364);
	start.setHours(0, 0, 0, 0);

	const counts = new Map<string, number>();
	for (const event of eventList) {
		const key = event.createdAt.slice(0, 10);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return Array.from({ length: 365 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = date.toISOString().slice(0, 10);
		return { date: key, count: counts.get(key) ?? 0 };
	});
}

const heatmap = computed(() => createYearHeatmap(events.value));
const maxHeat = computed(() =>
	Math.max(1, ...heatmap.value.map((day) => day.count)),
);

function byteSize(value: unknown) {
	return new Blob([JSON.stringify(value)]).size;
}

const sizeByType = computed(() => {
	const conversationsBytes = byteSize(allChats.value);
	const containersBytes = byteSize(allContainers.value);
	const packagesBytes = byteSize(localPlugins.value);
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
	localPlugins.value.map((item, index) => {
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
				byteSize(item) + byteSize(pkgConversations) + byteSize(pkgContainers),
			color: `hsl(${(index * 67) % 360} 70% 55%)`,
		};
	}),
);

const sizeSegments = computed(() =>
	diskMode.value === "type" ? sizeByType.value : sizeByPackage.value,
);
const totalSize = computed(() =>
	Math.max(
		1,
		sizeSegments.value.reduce((total, segment) => total + segment.bytes, 0),
	),
);

async function initialize() {
	if (loaded.value) return;
	events.value = (await selectAll<StatisticEvent>("statistic_events")).map(
		(item) => item.value,
	);
	await sync.init();
	allChats.value = (await selectAll<Conversation>("conversations")).map(
		(item) => item.value,
	);
	allContainers.value = (
		await selectAll<ChatMessageContainer>("message_containers")
	).map((item) => item.value);
	loaded.value = true;
}

onMounted(async () => {
	await initialize();
});

function heatClass(count: number) {
	const level = Math.ceil((count / maxHeat.value) * 4);
	return (
		[
			"bg-muted",
			"bg-emerald-950",
			"bg-emerald-800",
			"bg-emerald-600",
			"bg-emerald-400",
		][level] ?? "bg-muted"
	);
}

function formatSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <SettingPage title="数据统计" description="查看本地数据规模和最近一年的活动情况。">
    <section class="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-3 mobile:gap-2">
      <div class="min-w-0 rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">角色数</p>
        <p class="mt-2 text-2xl font-semibold">{{ packageCount }}</p>
      </div>
      <div class="min-w-0 rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">对话数</p>
        <p class="mt-2 text-2xl font-semibold">{{ conversationCount }}</p>
      </div>

      <div class="min-w-0 rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">消息数</p>
        <p class="mt-2 text-2xl font-semibold">{{ messageCount }}</p>
      </div>
    </section>

    <SettingGroup title="过去一年热力图">
      <div class="min-w-0 max-w-full px-4 py-4">
        <div class="grid max-w-full grid-flow-col grid-rows-7 justify-start gap-1 overflow-x-auto pb-1">
          <span
            v-for="day in heatmap"
            :key="day.date"
            class="size-3 rounded-sm"
            :class="heatClass(day.count)"
            :title="`${day.date}: ${day.count}`"
          />
        </div>
      </div>
    </SettingGroup>

    <SettingGroup title="磁盘管理">
      <SettingItem title="分析维度" description="切换类型占比或角色包占比。">
        <div class="flex gap-1 rounded-md bg-muted p-1">
          <Button size="sm" :variant="diskMode === 'type' ? 'secondary' : 'ghost'" @click="diskMode = 'type'">资源</Button>
          <Button size="sm" :variant="diskMode === 'package' ? 'secondary' : 'ghost'" @click="diskMode = 'package'">角色</Button>
        </div>
      </SettingItem>
      <div class="min-w-0 max-w-full px-4 py-4">
        <div class="flex h-4 overflow-hidden rounded-full bg-muted">
          <div
            v-for="segment in sizeSegments"
            :key="segment.id"
            class="h-full"
            :style="{ width: `${Math.max(2, (segment.bytes / totalSize) * 100)}%`, backgroundColor: segment.color }"
          />
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 mobile:grid-cols-1">
          <div
            v-for="segment in sizeSegments"
            :key="segment.id"
            class="flex items-center justify-between rounded-md border p-3"
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="size-3 shrink-0 rounded-full" :style="{ backgroundColor: segment.color }" />
              <span class="truncate text-sm font-medium">{{ segment.label }}</span>
            </div>
            <span class="shrink-0 text-sm text-muted-foreground">{{ formatSize(segment.bytes) }}</span>
          </div>
        </div>
      </div>
    </SettingGroup>
  </SettingPage>
</template>
