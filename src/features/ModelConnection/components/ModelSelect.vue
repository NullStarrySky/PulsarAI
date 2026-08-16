<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Brain, Check, ChevronDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { useModelConnectionStore } from "../services/model-connection-store";
import ProviderAvatar from "./ProviderAvatar.vue";
import { supportsFeatureService, type ModelApiType } from "../model-provider";
import {
  createModelReference,
  parseModelReference,
  thinkingLevelLabel,
  thinkingLevelOptions,
  type ThinkingLevel,
} from "../model-reference";

const props = withDefaults(defineProps<{
  modelValue: string;
  buttonClass?: string;
  apiType?: ModelApiType;
  allowEmpty?: boolean;
  emptyLabel?: string;
}>(), {
  buttonClass: "",
  allowEmpty: false,
  emptyLabel: "未设置",
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const store = useModelConnectionStore();
const parsed = computed(() => parseModelReference(props.modelValue));
const providers = computed(() => store.providers.filter((provider) =>
  provider.enabled
  && (!props.apiType || !["image", "asr", "tts"].includes(props.apiType) || supportsFeatureService(provider))
  && provider.models.some((model) => model.enabled && model.apiType === (props.apiType ?? "chat")),
));
const selectedProvider = computed(() =>
  store.providers.find((provider) => provider.id === parsed.value.providerId),
);
const selectedModel = computed(() =>
  selectedProvider.value?.models.find((model) => model.id === parsed.value.modelId),
);
const selectedThinkingLabel = computed(() => thinkingLevelLabel(parsed.value.thinkingLevel));
const hasSelection = computed(() => Boolean(parsed.value.providerId && parsed.value.modelId));
const thinkingIndex = computed(() => Math.max(
  0,
  thinkingLevelOptions.findIndex((option) => option.value === parsed.value.thinkingLevel),
));

onMounted(() => void store.initialize());

function modelsForProvider(providerId: string) {
  return store.providers
    .find((provider) => provider.id === providerId)
    ?.models.filter((model) => model.enabled && model.apiType === (props.apiType ?? "chat")) ?? [];
}

function selectModel(providerId: string, modelId: string) {
  emit("update:modelValue", createModelReference(providerId, modelId, parsed.value.thinkingLevel));
}

function clearModel() {
  emit("update:modelValue", "");
}

function updateThinking(values: number[] | undefined) {
  if (!parsed.value.providerId || !parsed.value.modelId) return;
  const level = thinkingLevelOptions[Math.round(values?.[0] ?? 0)]?.value as ThinkingLevel | undefined;
  if (!level) return;
  emit("update:modelValue", createModelReference(parsed.value.providerId, parsed.value.modelId, level));
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        :class="buttonClass"
        variant="outline"
        :title="`选择模型：${hasSelection ? selectedModel?.name || parsed.modelId : emptyLabel}${hasSelection ? `，思考深度 ${selectedThinkingLabel}` : ''}`"
        aria-label="选择模型"
      >
        <ProviderAvatar
          :name="hasSelection ? selectedModel?.name || selectedProvider?.name || parsed.modelId : emptyLabel"
          :src="selectedModel?.iconUrl || selectedProvider?.iconUrl"
          :provider-id="selectedProvider?.id || parsed.providerId"
        />
        <span class="min-w-0 truncate">{{ hasSelection ? selectedModel?.name || parsed.modelId : emptyLabel }}</span>
        <span v-if="(apiType ?? 'chat') === 'chat' && hasSelection" class="shrink-0 text-muted-foreground">{{ selectedThinkingLabel }}</span>
        <ChevronDown class="shrink-0 opacity-70" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="end" class="w-64">
      <DropdownMenuGroup>
        <DropdownMenuItem v-if="allowEmpty" @select="clearModel">
          <Check :class="hasSelection ? 'opacity-0' : 'opacity-100'" />
          <span class="min-w-0 truncate">{{ emptyLabel }}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator v-if="allowEmpty && providers.length" />
        <DropdownMenuSub v-for="provider in providers" :key="provider.id">
          <DropdownMenuSubTrigger>
            <ProviderAvatar :name="provider.name" :src="provider.iconUrl" :provider-id="provider.id" />
            <span class="min-w-0 flex-1 truncate">{{ provider.name }}</span>
            <Check v-if="provider.id === parsed.providerId" class="text-muted-foreground" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-64">
            <DropdownMenuItem
              v-for="model in modelsForProvider(provider.id)"
              :key="model.id"
              @select="selectModel(provider.id, model.id)"
            >
              <Check :class="provider.id === parsed.providerId && model.id === parsed.modelId ? 'opacity-100' : 'opacity-0'" />
              <span class="min-w-0 truncate">{{ model.name }}</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>

      <template v-if="(apiType ?? 'chat') === 'chat' && hasSelection">
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Brain />
            <span class="flex-1">思考强度</span>
            <span class="text-muted-foreground">{{ selectedThinkingLabel }}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent class="w-64 p-3" @select.prevent>
            <div class="mb-3 flex items-center justify-between gap-3 text-sm">
              <span class="font-medium">思考强度</span>
              <span class="text-muted-foreground">{{ selectedThinkingLabel }}</span>
            </div>
            <Slider
              :model-value="[thinkingIndex]"
              :min="0"
              :max="thinkingLevelOptions.length - 1"
              :step="1"
              @update:model-value="updateThinking"
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
