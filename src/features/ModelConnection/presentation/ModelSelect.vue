<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useModelConnectionStore } from "../application/model-connection-store";
import ModelPicker from "./ModelPicker.vue";
import ProviderAvatar from "./ProviderAvatar.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    buttonClass?: string;
    iconOnly?: boolean;
  }>(),
  {
    buttonClass: "",
    iconOnly: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const store = useModelConnectionStore();
const open = ref(false);

onMounted(() => {
  void store.initialize();
});

const label = computed(() => {
  const [providerId, ...modelIdParts] = props.modelValue.split("/");
  const modelId = modelIdParts.join("/");
  const provider = store.providers.find((item) => item.id === providerId);
  const model = provider?.models.find((item) => item.id === modelId);

  return provider && model ? `${provider.name} · ${model.name}` : props.modelValue;
});
const selectedProvider = computed(() => store.providers.find((item) => item.id === props.modelValue.split("/")[0]));

function updateModel(value: string) {
  emit("update:modelValue", value);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button :class="buttonClass" :variant="iconOnly ? 'ghost' : 'outline'" :title="label">
        <ProviderAvatar v-if="iconOnly" :name="selectedProvider?.name || label" :src="selectedProvider?.iconUrl" />
        <span v-else class="min-w-0 truncate">{{ label }}</span>
        <ChevronDown v-if="!iconOnly" class="size-4 shrink-0 opacity-70" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" class="w-[min(400px,calc(100vw-32px))] p-0">
      <ModelPicker :model-value="modelValue" @update:model-value="updateModel" />
    </PopoverContent>
  </Popover>
</template>
