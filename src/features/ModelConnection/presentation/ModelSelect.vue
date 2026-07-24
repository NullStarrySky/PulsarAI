<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useModelConnectionStore } from "../application/model-connection-store";
import ModelPicker from "./ModelPicker.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    buttonClass?: string;
  }>(),
  {
    buttonClass: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const store = useModelConnectionStore();
const open = ref(false);

const label = computed(() => {
  const [providerId, ...modelIdParts] = props.modelValue.split("/");
  const modelId = modelIdParts.join("/");
  const provider = store.providers.find((item) => item.id === providerId);
  const model = provider?.models.find((item) => item.id === modelId);

  return provider && model ? `${provider.name} · ${model.name}` : props.modelValue;
});

function updateModel(value: string) {
  emit("update:modelValue", value);
  open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button :class="buttonClass" variant="outline">
        <span class="min-w-0 truncate">{{ label }}</span>
        <ChevronDown class="size-4 shrink-0 opacity-70" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" class="w-[min(400px,calc(100vw-32px))] p-0">
      <ModelPicker :model-value="modelValue" @update:model-value="updateModel" />
    </PopoverContent>
  </Popover>
</template>
