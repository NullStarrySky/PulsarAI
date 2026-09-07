<script setup lang="ts">
import { computed, provide, ref, type HTMLAttributes } from "vue";
import { AccordionRoot } from "reka-ui";
import { cn } from "../../../lib/utils";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { StandaloneOpenKey } from "./accordion-context";

const props = withDefaults(
  defineProps<{
    type?: "single" | "multiple";
    collapsible?: boolean;
    defaultValue?: string | string[];
    /** 受控值（single: string；multiple: string[]）。 */
    modelValue?: string | string[];
    /** 把 accordion 的行钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——见 /docs/sizes）。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: HTMLAttributes["class"];
  }>(),
  { type: "single", collapsible: true }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string | string[]): void;
}>();

// 为 AccordionItemContext 追踪打开值
const internalValue = ref<string | string[]>(
  props.type === "multiple"
    ? ((props.defaultValue as string[] | undefined) ?? [])
    : ((props.defaultValue as string | undefined) ?? "")
);

const isControlled = computed(() => props.modelValue !== undefined);
const currentValue = computed<string | string[]>(() =>
  isControlled.value ? (props.modelValue as string | string[]) : internalValue.value
);

const openValues = computed<Set<string>>(() => {
  const v = currentValue.value;
  if (props.type === "multiple") return new Set(Array.isArray(v) ? v : []);
  return new Set(v ? [v as string] : []);
});

function handleValueChange(next: string | string[] | undefined) {
  if (!isControlled.value) {
    internalValue.value = next ?? (props.type === "multiple" ? [] : "");
  }
  emit("update:modelValue", next ?? (props.type === "multiple" ? [] : ""));
}

provide(StandaloneOpenKey, openValues);
provideSize({ size: () => props.size });
</script>

<template>
  <AccordionRoot
    :type="type"
    :collapsible="collapsible"
    :model-value="type === 'multiple' ? (currentValue as string[]) : (currentValue as string)"
    :as-child="true"
    @update:model-value="handleValueChange"
  >
    <div :class="cn('w-72 max-w-full flex flex-col gap-0.5', props.class)">
      <slot />
    </div>
  </AccordionRoot>
</template>
