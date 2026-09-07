<script setup lang="ts">
import { computed, ref } from "vue";
import {
  DropdownMenuRoot,
} from "reka-ui";
import { provideDropdownMenuContext } from "./dropdown-context";
import { provideSize, type SizeVariant } from "../../../lib/size-context";
import { usePropPassed } from "../../../lib/prop-passed";

const props = withDefaults(
  defineProps<{
    open?: boolean;
    defaultOpen?: boolean;
    disabled?: boolean;
    /** 把触发器一侧的内容与移植的弹出行钉在尺寸阶梯的某一档
     *  （默认 36px，紧凑 28px——见 /docs/sizes）。省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
  }>(),
  { defaultOpen: false, disabled: false }
);

const emit = defineEmits<{
  (e: "update:open", open: boolean): void;
}>();

// Boolean prop 未传时会被 Vue cast 成 false——受控判断检查键是否存在。
const openPassed = usePropPassed("open");

const internalOpen = ref(props.defaultOpen);
const open = computed(() => (openPassed ? !!props.open : internalOpen.value));

function handleOpenChange(next: boolean) {
  if (!openPassed) internalOpen.value = next;
  emit("update:open", next);
}

provideDropdownMenuContext({ open, disabled: props.disabled });
provideSize({ size: () => props.size });
</script>

<template>
  <!-- Root 始终由 open 受控（defaultOpen 只播种本地状态，不转发），
      让 DropdownContent 能在 portal 卸载前驱动退出动画。
      非模态：页面保持滚动，popup 跟随锚点而不脱锚。 -->
  <DropdownMenuRoot :open="open" :modal="false" @update:open="handleOpenChange">
    <slot />
  </DropdownMenuRoot>
</template>
