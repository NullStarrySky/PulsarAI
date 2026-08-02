<script setup lang="ts">
import { computed } from "vue";
import {
  Blocks,
  BrainCircuit,
  GitFork,
  Maximize2,
  Paperclip,
  PenTool,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import type { ConversationReasoningEffort } from "@/features/Resources/Conversation/domain/conversation-types";
import type { ComposerToolId } from "@/features/UI/domain/composer-toolbar";

defineProps<{
  toolIds: ComposerToolId[];
}>();

const emit = defineEmits<{
  attach: [];
  whiteboard: [];
  map: [];
  fullscreen: [];
}>();

const defaults = useDefaultConfigStore();
const conversation = useConversationStore();
const reasoningLevels = [
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" },
] as const satisfies ReadonlyArray<{
  value: ConversationReasoningEffort;
  label: string;
}>;
const reasoningEffort = computed(
  () => conversation.activeConversation?.reasoningEffort ?? "none",
);
const featureApiEnabled = computed(
  () => conversation.activeConversation?.featureApiEnabled ?? true,
);
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

function updateReasoning(values: number[] | undefined) {
  const index = Math.round(values?.[0] ?? 0);
  const effort = reasoningLevels[index]?.value;
  const conversationId = conversation.activeConversationId;
  if (!effort || !conversationId || effort === reasoningEffort.value) {
    return;
  }
  void conversation.setConversationReasoningEffort(conversationId, effort);
}

function toggleFeatureApi() {
  const conversationId = conversation.activeConversationId;
  if (!conversationId) return;
  void conversation.setConversationFeatureApiEnabled(
    conversationId,
    !featureApiEnabled.value,
  );
}
</script>

<template>
  <template v-for="toolId in toolIds" :key="toolId">
    <ModelSelect
      v-if="toolId === 'model'"
      :model-value="defaults.defaultChatModel"
      icon-only
      button-class="size-8 p-0 mobile:size-10"
      @update:model-value="defaults.setDefaultChatModel"
    />
    <Popover v-else-if="toolId === 'reasoning'">
      <PopoverTrigger as-child>
        <Button
          size="sm"
          :variant="reasoningEffort === 'none' ? 'ghost' : 'secondary'"
          class="h-8 gap-1.5 px-2 mobile:h-10"
          :title="`思考深度：${reasoningLabel}`"
        >
          <BrainCircuit data-icon="inline-start" />
          <span class="text-xs">{{ reasoningLabel }}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-72">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1">
            <h4 class="text-sm font-medium">思考深度：{{ reasoningLabel }}</h4>
            <p class="text-xs text-muted-foreground">
              控制模型回答前使用的推理强度。
            </p>
          </div>
          <Slider
            :model-value="[reasoningIndex]"
            :min="0"
            :max="reasoningLevels.length - 1"
            :step="1"
            aria-label="思考深度"
            @update:model-value="updateReasoning"
          />
          <div class="grid grid-cols-5 text-center text-[11px] text-muted-foreground">
            <span v-for="level in reasoningLevels" :key="level.value">
              {{ level.label }}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    <Button
      v-else-if="toolId === 'feature-api'"
      size="sm"
      :variant="featureApiEnabled ? 'secondary' : 'ghost'"
      class="h-8 gap-1.5 px-2 mobile:h-10"
      :title="featureApiEnabled ? 'Feature API：已注入' : 'Feature API：未注入'"
      :aria-pressed="featureApiEnabled"
      @click="toggleFeatureApi"
    >
      <Blocks class="size-4" />
      <span class="text-xs">API</span>
    </Button>
    <Button
      v-else-if="toolId === 'attachment'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="附加文件"
      @click="emit('attach')"
    >
      <Paperclip class="size-4" />
    </Button>
    <Button
      v-else-if="toolId === 'whiteboard'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="白板"
      @click="emit('whiteboard')"
    >
      <PenTool class="size-4" />
    </Button>
    <Button
      v-else-if="toolId === 'map'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="会话地图"
      @click="emit('map')"
    >
      <GitFork />
    </Button>
    <Button
      v-else-if="toolId === 'fullscreen'"
      size="icon"
      variant="ghost"
      class="size-8 mobile:size-10"
      title="全屏输入"
      @click="emit('fullscreen')"
    >
      <Maximize2 class="size-4" />
    </Button>
  </template>
</template>
