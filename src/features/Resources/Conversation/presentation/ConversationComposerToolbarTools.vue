<script setup lang="ts">
import {
	GitFork,
	LoaderCircle,
	Maximize2,
	MoreHorizontal,
	Paperclip,
	PenTool,
	Sparkles,
} from "lucide-vue-next";
import { push } from "notivue";
import { computed, ref } from "vue";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { optimizeComposerPrompt } from "@/features/Resources/Conversation/application/prompt-optimizer";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import {
	type PluginManifestFixedSetting,
	type PluginManifestValue,
	parsePluginManifest,
	pluginManifestFixedValue,
	setPluginManifestFixedValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import {
	findPluginNodeByPath,
	pluginConventions,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type { ComposerToolId } from "@/features/UI/domain/composer-toolbar";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";

const props = withDefaults(
	defineProps<{
		toolIds: ComposerToolId[];
		prompt?: string;
	}>(),
	{
		prompt: "",
	},
);

const emit = defineEmits<{
	attach: [];
	whiteboard: [];
	map: [];
	fullscreen: [];
	"update:prompt": [value: string];
}>();

const defaults = useDefaultConfigStore();
const conversation = useConversationStore();
const pluginStore = usePluginStore();
const optimizingPrompt = ref(false);
const mainPlugin = computed(
	() =>
		pluginStore.sortedPlugins.find(
			(plugin) => plugin.id === conversation.activePackage?.mainPluginId,
		) ?? null,
);
const mainManifestFile = computed(() => {
	const plugin = mainPlugin.value;
	if (!plugin) return null;
	const file = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
	return file?.kind === "file" ? file : null;
});
function fixedValue(setting: PluginManifestFixedSetting) {
	const file = mainManifestFile.value;
	if (!file) return null;
	const parsed = parsePluginManifest(file.content);
	return parsed.diagnostics.length
		? null
		: pluginManifestFixedValue(parsed.manifest, setting);
}
const selectedModel = computed(() => {
	const value = fixedValue("model");
	return typeof value === "string" && value.trim()
		? value.trim()
		: defaults.defaultChatModel;
});

async function updateFixedSetting(
	setting: PluginManifestFixedSetting,
	value: PluginManifestValue,
) {
	const plugin = mainPlugin.value;
	const file = mainManifestFile.value;
	if (!plugin || !file) {
		push.error("主要插件缺少 manifest.json");
		return;
	}
	const parsed = parsePluginManifest(file.content);
	if (parsed.diagnostics.length) {
		push.error(`manifest.json 无效：${parsed.diagnostics[0]!.message}`);
		return;
	}
	setPluginManifestFixedValue(parsed.manifest, setting, value);
	await pluginStore.updateNode(plugin.id, file.id, {
		content: parsed.manifest,
	});
}

async function optimizePrompt() {
	if (!props.prompt.trim()) {
		push.warning("请先输入需要优化的内容。");
		return;
	}
	if (optimizingPrompt.value) return;
	optimizingPrompt.value = true;
	try {
		emit("update:prompt", await optimizeComposerPrompt(props.prompt));
		push.success("提示词已优化");
	} catch (error) {
		push.error(error instanceof Error ? error.message : "提示词优化失败");
	} finally {
		optimizingPrompt.value = false;
	}
}

const appearance = useAppearanceStore();
const hasModel = computed(() => props.toolIds.includes("model"));
const nestedTools = ["optimize", "attachment", "whiteboard"] as const;
function isToolEnabled(id: ComposerToolId) {
	return !appearance.composerToolbar.unused.includes(id);
}
</script>

<template>
  <template v-for="toolId in toolIds" :key="toolId">
    <!-- More Tools Dropdown Menu (Rendered to the left of the model selector) -->
    <DropdownMenu v-if="hasModel && toolId === 'model'">
      <DropdownMenuTrigger as-child>
        <Button
          size="icon"
          variant="ghost"
          class="h-8  w-4 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          title="更多工具"
        >
          <MoreHorizontal class="size-4.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-64">
        <!-- Other nested tools -->
        <template v-for="tId in nestedTools" :key="tId">
          <template v-if="isToolEnabled(tId)">
            <!-- optimize -->
            <DropdownMenuItem v-if="tId === 'optimize'" @click="optimizePrompt">
              <LoaderCircle v-if="optimizingPrompt" class="animate-spin" />
              <Sparkles v-else />
              <span>优化提示词</span>
            </DropdownMenuItem>

            <!-- attachment -->
            <DropdownMenuItem v-else-if="tId === 'attachment'" @click="emit('attach')">
              <Paperclip />
              <span>附加文件</span>
            </DropdownMenuItem>

            <!-- whiteboard -->
            <DropdownMenuItem v-else-if="tId === 'whiteboard'" @click="emit('whiteboard')">
              <PenTool />
              <span>打开白板</span>
            </DropdownMenuItem>
          </template>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>

    <!-- Excluded actions rendered normally in their toolbar position -->
    <ModelSelect
      v-if="toolId === 'model'"
      :model-value="selectedModel"
      button-class="h-8 max-w-[min(18rem,46vw)] justify-between rounded-lg border-0 bg-muted/65 px-2.5 text-xs shadow-none mobile:h-10"
      @update:model-value="updateFixedSetting('model', $event)"
    />
    <Button
      v-else-if="toolId === 'map'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10 rounded-lg"
      title="会话地图"
      @click="emit('map')"
    >
      <GitFork class="size-4" />
    </Button>
    <Button
      v-else-if="toolId === 'fullscreen'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10 rounded-lg"
      title="全屏输入"
      @click="emit('fullscreen')"
    >
      <Maximize2 class="size-4" />
    </Button>
  </template>
</template>
