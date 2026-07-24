import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { selectAll, upsert } from "@/features/Database/application/database-service";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { createStatisticEvent, createYearHeatmap, type StatisticEvent } from "../domain/statistic";

const table = "statistic_events";

export const useStatisticStore = defineStore("statistic", () => {
  const events = ref<StatisticEvent[]>([]);
  const loaded = ref(false);
  const conversation = useConversationStore();

  const messageCount = computed(() =>
    conversation.containers.reduce((total, container) => total + container.content.length, 0),
  );
  const heatmap = computed(() => createYearHeatmap(events.value));
  const sizeByType = computed(() => {
    const conversations = byteSize(conversation.conversations);
    const containers = byteSize(conversation.containers);
    const packages = byteSize(conversation.packages);
    return [
      { id: "packages", label: "角色包", bytes: packages, color: "var(--chart-1)" },
      { id: "conversations", label: "对话", bytes: conversations, color: "var(--chart-2)" },
      { id: "messages", label: "消息", bytes: containers, color: "var(--chart-3)" },
    ];
  });
  const sizeByPackage = computed(() =>
    conversation.packages.map((item, index) => {
      const conversations = conversation.conversations.filter((conversationItem) => conversationItem.packageId === item.id);
      const conversationIds = new Set(conversations.map((conversationItem) => conversationItem.id));
      const containers = conversation.containers.filter((container) => conversationIds.has(container.conversationid));
      return {
        id: item.id,
        label: item.name,
        bytes: byteSize(item) + byteSize(conversations) + byteSize(containers),
        color: `hsl(${(index * 67) % 360} 70% 55%)`,
      };
    }),
  );

  async function initialize() {
    if (loaded.value) {
      return;
    }
    events.value = (await selectAll<StatisticEvent>(table)).map((item) => item.value);
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
