<script setup lang="ts">
import { computed, reactive, ref, watch, onUnmounted } from "vue";
import { SelectRoot } from "reka-ui";
import { selectionAckMs, provideSelectContext } from "./select-context";
import { spring, exitFallbackMs } from "../../../lib/springs";
import { provideSize, type SizeVariant } from "../../../lib/size-context";

const props = withDefaults(
  defineProps<{
    /** 标准受控值（v-model）。 */
    modelValue?: string;
    /** 受控值（向下兼容）。 */
    value?: string;
    defaultValue?: string;
    disabled?: boolean;
    name?: string;
    required?: boolean;
    /** 把触发器与 popup 钉在尺寸阶梯的某一档（默认 36px，紧凑 28px——
     *  见 /docs/sizes）。省略时两者都跟随外围 SizeProvider。 */
    size?: SizeVariant;
  }>(),
  { disabled: false }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:value", value: string): void;
}>();

const internalValue = ref(props.defaultValue ?? "");
const open = ref(false);
const radixOpen = ref(false);

const boundValue = computed(() => props.modelValue !== undefined ? props.modelValue : props.value);
const currentValue = computed(() => boundValue.value !== undefined ? boundValue.value : internalValue.value);

let lastPick = 0;
let ackTimeout: number | null = null;

function cancelAckClose() {
  if (ackTimeout !== null) {
    clearTimeout(ackTimeout);
    ackTimeout = null;
  }
}

onUnmounted(cancelAckClose);

function handleValueChange(next: string) {
  lastPick = performance.now();
  if (boundValue.value === undefined) internalValue.value = next;
  emit("update:modelValue", next);
  emit("update:value", next);
}

// 选择一项时先确认再关闭：关闭被 selectionAckMs 推迟，让勾选画入与
// 选中背景弹向所选行的动画被看到。reka 不上报关闭原因，所以紧随
// onValueChange 之后的关闭被解读为选择驱动；其他所有关闭
// （Escape、外部按压、触发器切换）立即执行并取消未决的确认；重新选择会重启它。
function handleOpenChange(nextOpen: boolean) {
  if (!nextOpen && performance.now() - lastPick < 100) {
    cancelAckClose();
    ackTimeout = window.setTimeout(() => {
      ackTimeout = null;
      open.value = false;
    }, selectionAckMs);
    return;
  }
  cancelAckClose();
  open.value = nextOpen;
  if (nextOpen) radixOpen.value = true;
  // 关闭：radixOpen 由 SelectContent 在退出动画完成后释放
  // （onAnimationComplete 或超时后备）。
}

function unmount() {
  radixOpen.value = false;
}

// value → label 注册表：SelectItem 挂载即注册（detached fragment 里也会
// 挂载），触发器的选中 label 从这里取，规避 reka ItemText portal 在
// 弹层卸载瞬间丢失导致的 placeholder 闪烁。
// reactive Map：注册会触发读取方（SelectTrigger 的 computed）重算。
const labels = reactive(new Map<string, string>());
function registerLabel(value: string, label: string) {
  labels.set(value, label);
}
function labelFor(value: string): string | null {
  return labels.get(value) ?? null;
}

// 兜底：如果退出完成回调未触发（后台标签页 rAF 停摆），按退出时长
// 加缓冲强制释放。
watch(open, (o) => {
  if (o) return;
  const id = window.setTimeout(() => {
    radixOpen.value = false;
  }, exitFallbackMs(spring.fast));
  return () => clearTimeout(id);
});

provideSelectContext({
  value: currentValue,
  open,
  unmount,
  registerLabel,
  labelFor,
});

provideSize({ size: () => props.size });
</script>

<template>
  <!-- 始终受控；""（无选择）显示 placeholder——reka 对 placeholder 把 "" 与
      undefined 等同处理，但 undefined 会把根翻转为非受控。 -->
  <SelectRoot
    :model-value="currentValue"
    :open="radixOpen"
    :disabled="disabled"
    :name="name"
    :required="required"
    @update:model-value="handleValueChange"
    @update:open="handleOpenChange"
  >
    <slot />
  </SelectRoot>
</template>
