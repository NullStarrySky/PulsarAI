<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button } from "@/components/fluid";
import Manager from "@/features/Conversation/components/Manager.vue";
import Surface from "@/features/Conversation/components/Surface.vue";
import { initConversationVersions } from "@/features/Conversation/dataflow/conversations";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { host } from "@/host";
import { History, X } from "@/lib/remix-icons";
import { useUIStore } from "../store";
import type { SubWindowParams } from "./sub-window-protocol";

const props = defineProps<{ subWindowParams: SubWindowParams | null }>();
const sync = useSyncStore();
const ui = useUIStore();
const managerOpen = ref(false);
const conversationId = computed(() =>
	ui.page.type === "conversation" ? ui.page.id : "",
);
const conversation = computed(() =>
	[...sync.conversationMeta.values()]
		.map((list) => list.get(conversationId.value))
		.find(Boolean),
);
const initialId =
	props.subWindowParams?.target.type === "resource" &&
	props.subWindowParams.target.resourceType === "conversation"
		? props.subWindowParams.target.resourceId
		: "";

async function closeWindow() {
	await ui.switch({ type: "home" });
	await host.desktop?.window.close();
}
const stopCloseRequest = host.desktop?.window.onCloseRequest(() => {
	void closeWindow();
});
onBeforeUnmount(() => stopCloseRequest?.());
onMounted(async () => {
	if (!initialId) return;
	await Promise.all([sync.init(), initConversationVersions()]);
	await ui.switch({ type: "conversation", id: initialId });
});
watch(managerOpen, async (open) => {
	if (open && conversation.value)
		await sync.load({
			type: "conversationList",
			id: conversation.value.localPluginId,
		});
});
</script>

<template>
  <section class="flex h-[100dvh] min-h-0 flex-col bg-background text-foreground">
    <header class="electron-window-drag-region flex h-10 shrink-0 items-center gap-2 border-b px-3">
      <p class="min-w-0 flex-1 truncate text-sm font-medium">{{ conversation?.title ?? props.subWindowParams?.title ?? 'PulsarAI' }}</p>
      <div class="flex items-center" data-window-drag-block>
        <Button variant="ghost" size="icon-sm" title="会话列表" @click="managerOpen = !managerOpen"><History class="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" title="关闭窗口" @click="closeWindow"><X class="size-4" /></Button>
      </div>
    </header>
    <div class="relative flex min-h-0 flex-1">
      <Surface v-if="conversationId" :key="conversationId" class="min-w-0 flex-1" :conversation-id="conversationId" />
      <p v-else class="m-auto text-sm text-muted-foreground">正在加载会话…</p>
      <Manager v-if="conversation" :local-plugin-id="conversation.localPluginId" :conversation-id="conversationId" v-model:open="managerOpen" @select="id => ui.switch({ type: 'conversation', id })" @new-window="id => { if (id !== conversationId) void ui.openAtNewWindow(id) }" @close="id => { if (id === conversationId) void ui.switch({ type: 'home' }) }" />
    </div>
  </section>
</template>
