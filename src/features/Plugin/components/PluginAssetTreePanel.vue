<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { GlideTabs } from "@/components/common/glide";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Box, Folder, Globe } from "@/lib/remix-icons";
import type { Pulse, ReplayGroups } from "../dataflow/types";
import { useFileTreeUI } from "../dataflow/use-file-tree-ui";
import {
	useEditablePluginData,
	usePluginData,
} from "../dataflow/use-plugin-data";
import PluginFileEditorDialog from "../resources/PluginFileEditorDialog.vue";
import type { FileTreeAction, FileTreeNode } from "./FileTree.vue";
import FileTree from "./FileTree.vue";

const props = withDefaults(
	defineProps<{
		localPluginId?: string;
		replayGroups?: ReplayGroups;
		applyPulse?: (pulse: Pulse) => void;
	}>(),
	{
		localPluginId: "",
		replayGroups: () => [],
	},
);

const emit = defineEmits<{
	open: [path: string];
	select: [node: FileTreeNode];
}>();

const tab = ref<"local" | "global" | "slots">("local");
const selected = ref("");
const expanded = ref<string[]>([]);
const activeEditorPath = ref<string | null>(null);

const pluginId = computed(() => props.localPluginId);

const filetree = usePluginData(
	() => pluginId.value,
	() => props.replayGroups,
);

const defaultEditable = useEditablePluginData(() => pluginId.value);
const effectiveApplyPulse = (pulse: Pulse) => {
	if (props.applyPulse) props.applyPulse(pulse);
	else defaultEditable.applyPulse(pulse);
};

const ui = useFileTreeUI({
	filetree,
	applyPulse: effectiveApplyPulse,
});

const active = computed(() => ui.tabs[tab.value]);
const activeNodes = computed(() => active.value?.tree?.value ?? []);

function handleOpen(node: FileTreeNode) {
	const path = node.data?.path ?? node.id;
	if (!path) return;
	activeEditorPath.value = path;
	emit("open", path);
}

function handleAction(
	node: FileTreeNode,
	action: FileTreeAction,
	value?: string,
) {
	if (action.id === "open") {
		const path = node.data?.path ?? node.id;
		if (path) {
			activeEditorPath.value = path;
			emit("open", path);
		}
		return;
	}
	ui.runAction(node, action, value);
}

// Automatically expand root node when nodes first load
watch(
	activeNodes,
	(nodes) => {
		if (nodes.length > 0 && expanded.value.length === 0) {
			expanded.value = [nodes[0]!.id];
		}
	},
	{ immediate: true },
);
</script>

<template>
  <aside class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent select-none">
    <!-- Header with tab switcher -->
    <header class="flex h-10 shrink-0 items-center justify-between border-b border-border/50 px-2.5">
      <GlideTabs
        v-model="tab"
        size="sm"
        :items="[
          { value: 'local', label: '本地', icon: Folder },
          { value: 'global', label: '全局', icon: Globe },
          { value: 'slots', label: '插槽', icon: Box },
        ]"
      />
    </header>

    <!-- Tree Content -->
    <div class="relative min-h-0 flex-1 overflow-hidden">
      <ScrollArea v-if="activeNodes.length > 0" class="size-full">
        <FileTree
          v-model="selected"
          v-model:expanded="expanded"
          :nodes="activeNodes"
          :min-width="220"
          class="min-h-0 p-1"
          @select="emit('select', $event)"
          @open="handleOpen"
          @toggle-resource="ui.toggleResource"
          @action="handleAction"
        />
      </ScrollArea>
      <div v-else class="flex size-full flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground/60">
        <p>暂无资源文件</p>
      </div>
    </div>

    <!-- Floating File Editor Dialog -->
    <PluginFileEditorDialog
      v-if="activeEditorPath"
      :path="activeEditorPath"
      :filetree="filetree"
      :apply-pulse="effectiveApplyPulse"
      @close="activeEditorPath = null"
    />
  </aside>
</template>
