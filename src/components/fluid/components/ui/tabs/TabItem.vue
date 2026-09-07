<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { TabsTrigger } from "reka-ui";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useSize } from "../../../lib/size-context";
import type { IconComponent } from "../../../lib/icon-context";
import { useTabsList } from "./tabs-context";

const props = withDefaults(
  defineProps<{
    /** 此 tab 的唯一值。 */
    value: string;
    /** 可选前导图标。 */
    icon?: IconComponent;
    /** 文本标签（可选，也可直接在默认插槽中写内容）。 */
    label?: string;
    class?: string;
  }>(),
  {}
);

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

defineOptions({ name: "TabItem" });

const internalRef = ref<HTMLButtonElement | null>(null);
const sizeClasses = useSize();
const { registerTab, claimIndex, hoveredIndex, selectedValue, setOptimisticIdx } =
  useTabsList();

// 领取挂载顺序索引并注册（值 + 元素）。
const index = ref<number>(-1);
if (index.value === -1) {
  index.value = claimIndex();
}

function setTriggerRef(el: any) {
  internalRef.value = (el?.$el as HTMLButtonElement | null) ?? el ?? null;
}

watch(
  [index, () => props.value, internalRef] as const,
  ([idx, value, el], _prev, onCleanup) => {
    registerTab(idx, value, el);
    onCleanup(() => registerTab(idx, value, null));
  },
  { immediate: true }
);

const isSelected = computed(() => selectedValue?.value === props.value);
const isActive = computed(() => hoveredIndex.value === index.value || isSelected.value);

function handleClick(e: MouseEvent) {
  // 组合（不可被覆盖）：消费方的 onClick 不能替换乐观的指示器跳动。
  setOptimisticIdx(index.value);
  emit("click", e);
}
</script>

<template>
  <TabsTrigger
    :ref="setTriggerRef"
    :value="value"
    :data-proximity-index="index"
    :class="
      cn(
        'relative z-10 flex cursor-pointer items-center justify-center border-none bg-transparent px-3 outline-none whitespace-nowrap',
        sizeClasses.segmentItem,
        sizeClasses.gap,
        '[&_svg]:size-4 [&_svg]:shrink-0',
        props.class
      )
    "
    @click="handleClick"
  >
    <component
      :is="icon"
      v-if="icon"
      :size="sizeClasses.icon"
      :stroke-width="isActive ? 2 : 1.5"
      :class="
        cn(
          'transition-[color,stroke-width] duration-80',
          isActive ? 'text-foreground' : 'text-muted-foreground'
        )
      "
    />
    <template v-if="$slots.default">
      <span
        :class="
          cn(
            'inline-flex items-center gap-1.5 transition-colors duration-80',
            sizeClasses.text,
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: isSelected ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        <slot />
      </span>
    </template>
    <span v-else-if="label" :class="cn('inline-grid whitespace-nowrap', sizeClasses.text)">
      <span
        class="col-start-1 row-start-1 invisible [text-box:trim-both_cap_alphabetic]"
        :style="{ fontVariationSettings: fontWeights.semibold }"
        aria-hidden="true"
      >
        {{ label }}
      </span>
      <span
        :class="
          cn(
            'col-start-1 row-start-1 transition-[color,font-variation-settings] duration-80 [text-box:trim-both_cap_alphabetic]',
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )
        "
        :style="{
          fontVariationSettings: isSelected ? fontWeights.semibold : fontWeights.normal,
        }"
      >
        {{ label }}
      </span>
    </span>
  </TabsTrigger>
</template>
