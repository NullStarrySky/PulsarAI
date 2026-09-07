<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { TabsRoot } from "reka-ui";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { TabsValueOrderKey, type TabsValueOrderContextValue } from "./tabs-context";

const props = defineProps<{
  /** 标准受控值（v-model）。 */
  modelValue?: string;
  /** 受控值（向下兼容）。 */
  value?: string;
  /** 基于索引的受控替代。 */
  selectedIndex?: number;
  /** 初始值（非受控）。 */
  defaultValue?: string;
  /** 把分段控件钉在尺寸阶梯的某一档（默认 36px 外框，紧凑 28px——
   *  见 /docs/sizes）。省略时跟随外围 SizeProvider。 */
  size?: SizeVariant;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:value", value: string): void;
  (e: "select", index: number): void;
}>();

const valueOrder = ref<string[]>([]);
const uncontrolledValue = ref<string | undefined>(props.defaultValue);

function updateValueOrder(order: string[]) {
  if (
    valueOrder.value.length === order.length &&
    valueOrder.value.every((v, i) => v === order[i])
  ) {
    return;
  }
  valueOrder.value = order;
}

// 解析值：显式 modelValue / value > selectedIndex 查找 > 非受控状态。
const boundValue = computed(() => props.modelValue !== undefined ? props.modelValue : props.value);
const resolvedValue = computed(
  () =>
    boundValue.value ??
    (props.selectedIndex != null ? valueOrder.value[props.selectedIndex] : uncontrolledValue.value ?? valueOrder.value[0])
);

function handleValueChange(newValue: string) {
  if (boundValue.value === undefined && props.selectedIndex == null) {
    uncontrolledValue.value = newValue;
  }
  emit("update:modelValue", newValue);
  emit("update:value", newValue);
  const idx = valueOrder.value.indexOf(newValue);
  if (idx !== -1) emit("select", idx);
}

provide(TabsValueOrderKey, {
  valueOrder,
  setValueOrder: updateValueOrder,
  selectedValue: resolvedValue,
} satisfies TabsValueOrderContextValue);

provideSize({ size: () => props.size });
</script>

<template>
  <!-- 始终受控：给原语先 undefined 后 defined 的值会把它从非受控翻转为受控。
      valueOrder 在首次提交时为空，回退到空字符串哨兵——TabsList 的
      挂载钩子在绘制前填充 valueOrder，修正后的值在可见之前落地。 -->
  <TabsRoot
    :model-value="resolvedValue ?? ''"
    activation-mode="automatic"
    @update:model-value="handleValueChange"
  >
    <slot />
  </TabsRoot>
</template>
