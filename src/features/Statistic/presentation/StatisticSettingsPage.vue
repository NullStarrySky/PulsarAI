<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useStatisticStore } from "../application/statistic-store";

const conversation = useConversationStore();
const statistic = useStatisticStore();
const diskMode = ref<"type" | "package">("type");

const heatmap = computed(() => statistic.heatmap);
const maxHeat = computed(() => Math.max(1, ...heatmap.value.map((day) => day.count)));
const sizeSegments = computed(() => diskMode.value === "type" ? statistic.sizeByType : statistic.sizeByPackage);
const totalSize = computed(() => Math.max(1, sizeSegments.value.reduce((total, segment) => total + segment.bytes, 0)));

onMounted(async () => {
  await Promise.all([conversation.initialize(), statistic.initialize()]);
});

function heatClass(count: number) {
  const level = Math.ceil((count / maxHeat.value) * 4);
  return ["bg-muted", "bg-emerald-950", "bg-emerald-800", "bg-emerald-600", "bg-emerald-400"][level] ?? "bg-muted";
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <SettingPage title="数据统计" description="查看本地数据规模和最近一年的活动情况。">
    <section class="grid grid-cols-3 gap-3 mobile:gap-2">
      <div class="rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">角色数</p>
        <p class="mt-2 text-2xl font-semibold">{{ conversation.packages.length }}</p>
      </div>
      <div class="rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">对话数</p>
        <p class="mt-2 text-2xl font-semibold">{{ conversation.conversations.length }}</p>
      </div>
      <div class="rounded-md border bg-card p-4 mobile:p-3">
        <p class="text-xs text-muted-foreground">消息数</p>
        <p class="mt-2 text-2xl font-semibold">{{ statistic.messageCount }}</p>
      </div>
    </section>

    <SettingGroup title="过去一年热力图" description="根据启动和消息事件统计活跃度。">
      <div class="px-4 py-4">
        <div class="grid grid-flow-col grid-rows-7 justify-start gap-1 overflow-x-auto pb-1">
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

    <SettingGroup title="磁盘管理" description="按 JSON 数据体积估算各类资源占比。">
      <SettingItem title="分析维度" description="切换类型占比或角色包占比。">
        <div class="flex gap-1 rounded-md bg-muted p-1">
          <Button size="sm" :variant="diskMode === 'type' ? 'secondary' : 'ghost'" @click="diskMode = 'type'">资源</Button>
          <Button size="sm" :variant="diskMode === 'package' ? 'secondary' : 'ghost'" @click="diskMode = 'package'">角色</Button>
        </div>
      </SettingItem>
      <div class="px-4 py-4">
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
            class="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
          >
            <span class="flex min-w-0 items-center gap-2">
              <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: segment.color }" />
              <span class="truncate">{{ segment.label }}</span>
            </span>
            <span class="shrink-0 text-muted-foreground">{{ formatSize(segment.bytes) }}</span>
          </div>
        </div>
      </div>
    </SettingGroup>
  </SettingPage>
</template>
