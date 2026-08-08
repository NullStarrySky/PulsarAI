<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BrainCircuit,
  GitFork,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  PenTool,
  Puzzle,
  Sparkles,
} from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { pluginGenerateFile } from "@/features/Resources/Plugin/domain/plugin-runtime";
import {
  parsePluginManifest,
  pluginManifestFixedValue,
  setPluginManifestFixedValue,
  type PluginManifestFixedSetting,
  type PluginManifestValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import {
  findPluginNodeByPath,
  pluginConventions,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type { ReasoningEffort } from "@/features/defaultConfigs/domain/default-config";
import type { ComposerToolId } from "@/features/UI/domain/composer-toolbar";
import { optimizeComposerPrompt } from "@/features/Resources/Conversation/application/prompt-optimizer";

const props = withDefaults(defineProps<{
  toolIds: ComposerToolId[];
  prompt?: string;
}>(), {
  prompt: "",
});

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
const reasoningLevels = [
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" },
] as const satisfies ReadonlyArray<{
  value: ReasoningEffort;
  label: string;
}>;
const mainPlugin = computed(() =>
  pluginStore.sortedPlugins.find(
    (plugin) => plugin.id === conversation.activePackage?.mainPluginId,
  ) ?? null
);
const mainPluginOptions = computed(() => {
  const activePackage = conversation.activePackage;
  if (!activePackage) return [];
  return pluginStore.sortedPlugins.filter(
    (plugin) => (plugin.id === activePackage.pluginId || plugin.packageId === null)
      && pluginGenerateFile(plugin),
  );
});
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
const reasoningEffort = computed(() => {
  const value = fixedValue("reasoningEffort");
  return reasoningLevels.some((item) => item.value === value)
    ? value as ReasoningEffort
    : defaults.reasoningEffort;
});
const reasoningIndex = computed(() =>
  Math.max(
    0,
    reasoningLevels.findIndex(
      (item) => item.value === reasoningEffort.value,
    ),
  ),
);
const reasoningLabel = computed(
  () => reasoningLevels[reasoningIndex.value]?.label ?? "关闭",
);

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
  await pluginStore.updateNode(plugin.id, file.id, { content: parsed.manifest });
}

async function updateMainPlugin(value: unknown) {
  const activePackage = conversation.activePackage;
  const pluginId = String(value ?? "");
  if (!activePackage || !pluginId || pluginId === activePackage.mainPluginId) return;
  try {
    await conversation.updatePackage(activePackage.id, { mainPluginId: pluginId });
  } catch (error) {
    push.error(error instanceof Error ? error.message : "主要插件切换失败");
  }
}

function updateReasoning(values: number[] | undefined) {
  const index = Math.round(values?.[0] ?? 0);
  const effort = reasoningLevels[index]?.value;
  if (!effort || effort === reasoningEffort.value) {
    return;
  }
  void updateFixedSetting("reasoningEffort", effort);
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
const nestedTools = ["plugin", "reasoning", "optimize", "attachment", "whiteboard"] as const;
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
          class="size-8 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          title="更多工具"
        >
          <MoreHorizontal class="size-4.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-56 p-1.5 rounded-xl border shadow-lg bg-popover text-popover-foreground">
        <!-- Plugin tool (Nested Submenu) -->
        <DropdownMenuSub v-if="isToolEnabled('plugin') && conversation.activePackage">
          <DropdownMenuSubTrigger class="rounded-lg text-xs">
            <Puzzle class="mr-2 size-3.5 text-primary" />
            <span>选择主要插件</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-56 p-1.5 rounded-xl shadow-md bg-popover text-popover-foreground border" @select.prevent>
            <div class="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">主要插件</div>
            <button
              v-for="plg in mainPluginOptions"
              :key="plg.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              :class="conversation.activePackage.mainPluginId === plg.id && 'bg-accent/80 font-semibold'"
              @click="updateMainPlugin(plg.id)"
            >
              <Puzzle class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="truncate">{{ plg.name }}</span>
            </button>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <!-- Reasoning tool (Nested Submenu) -->
        <DropdownMenuSub v-if="isToolEnabled('reasoning')">
          <DropdownMenuSubTrigger class="rounded-lg text-xs">
            <BrainCircuit class="mr-2 size-3.5 text-primary" />
            <span>设置思考深度</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-56 p-3 rounded-xl shadow-md bg-popover text-popover-foreground border" @select.prevent>
            <div class="flex w-full flex-col gap-3">
              <div class="flex items-center gap-1.5 font-medium text-xs">
                <BrainCircuit class="size-3.5 text-primary" />
                <span>思考深度：{{ reasoningLabel }}</span>
              </div>
              <Slider
                :model-value="[reasoningIndex]"
                :min="0"
                :max="reasoningLevels.length - 1"
                :step="1"
                class="my-1 cursor-pointer"
                @update:model-value="updateReasoning"
              />
            </div>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator v-if="(isToolEnabled('plugin') || isToolEnabled('reasoning')) && (isToolEnabled('optimize') || isToolEnabled('attachment') || isToolEnabled('whiteboard'))" />

        <!-- Other nested tools -->
        <template v-for="tId in nestedTools" :key="tId">
          <template v-if="tId !== 'plugin' && tId !== 'reasoning' && isToolEnabled(tId)">
            <!-- optimize -->
            <DropdownMenuItem v-if="tId === 'optimize'" class="rounded-lg text-xs" @click="optimizePrompt">
              <LoaderCircle v-if="optimizingPrompt" class="mr-2 size-3.5 animate-spin" />
              <Sparkles v-else class="mr-2 size-3.5 text-primary" />
              <span>优化提示词</span>
            </DropdownMenuItem>

            <!-- attachment -->
            <DropdownMenuItem v-else-if="tId === 'attachment'" class="rounded-lg text-xs" @click="emit('attach')">
              <Paperclip class="mr-2 size-3.5 text-primary" />
              <span>附加文件</span>
            </DropdownMenuItem>

            <!-- whiteboard -->
            <DropdownMenuItem v-else-if="tId === 'whiteboard'" class="rounded-lg text-xs" @click="emit('whiteboard')">
              <PenTool class="mr-2 size-3.5 text-primary" />
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
      icon-only
      button-class="size-8 p-0 mobile:size-10 rounded-lg"
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
