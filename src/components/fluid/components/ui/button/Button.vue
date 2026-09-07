<script setup lang="ts">
import { computed, useAttrs, useSlots, type VNode } from "vue";
import { flattenAllowedChildren } from "./flatten-children";
import ButtonInternals from "./ButtonInternals.vue";
import { VNodes } from "./VNodes";
import {
  buttonVariants,
  bgVariants,
  activeBgVariants,
  legacySizeAliases,
  type ButtonSize,
  type ButtonSizeCanonical,
  type ButtonVariant,
} from "./button-variants";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";
import { useSizeVariant } from "../../../lib/size-context";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    /** 省略时按钮跟随外围 SizeProvider（默认 36px，紧凑 28px）。
     *  sm/default/lg/icon 等规范值均可解析。 */
    size?: ButtonSize;
    asChild?: boolean;
    loading?: boolean;
    /** 强制呈现按下/按住状态。当按钮驱动外部 UI（popover、dropdown 等）
     *  时有用——菜单展示期间按钮读作「已按下」。 */
    active?: boolean;
    disabled?: boolean;
  }>(),
  { variant: "default", asChild: false, loading: false, active: false }
);

const attrs = useAttrs();
const slots = useSlots();
const shape = useShape();

defineOptions({ name: "Button", inheritAttrs: false });

// asChild：用户的元素成为根，但按钮的内部结构（bg 层、内容 wrapper、
// spinner）必须保留。我们渲染用户的元素类型并注入内部结构作为
// 它的 children——元素自己的 children 成为内容 wrapper 里的标签。
const childVnode = computed<VNode | null>(() =>
  props.asChild ? flattenAllowedChildren(slots.default?.()) : null
);

// 解析尺寸：显式 prop（旧别名映射到规范阶梯）> 外围 SizeProvider > 默认。
const contextSize = useSizeVariant();
const resolvedSize = computed<ButtonSizeCanonical>(() => {
  if (props.size) return legacySizeAliases[props.size] ?? (props.size as ButtonSizeCanonical);
  return contextSize.value === "compact" ? "compact" : "default";
});
const isIconOnly = computed(
  () => resolvedSize.value === "icon" || resolvedSize.value === "icon-compact"
);
const isCompact = computed(
  () => resolvedSize.value === "compact" || resolvedSize.value === "icon-compact"
);
const bgClass = computed(() =>
  props.active
    ? activeBgVariants[props.variant ?? "default"]
    : bgVariants[props.variant ?? "default"]
);

const rootClass = computed(() =>
  cn(
    buttonVariants({
      variant: props.variant,
      size: resolvedSize.value,
    }),
    shape.value.button,
    attrs.class as string | undefined
  )
);

// class 已并入 rootClass，绑定到根时要剥掉，避免覆盖 :class。
const buttonAttrs = computed(() => {
  const { class: _class, ...rest } = attrs as Record<string, unknown>;
  return rest;
});
</script>

<template>
  <button v-if="!childVnode" :class="rootClass" :disabled="disabled || loading" v-bind="buttonAttrs">
    <ButtonInternals
      :bg-class="bgClass"
      :loading="loading"
      :is-icon-only="isIconOnly"
      :is-compact="isCompact"
    >
      <slot />
    </ButtonInternals>
  </button>

  <component
    :is="childVnode.type"
    v-else
    v-bind="{ ...childVnode.props, ...buttonAttrs, class: rootClass }"
  >
    <ButtonInternals
      :bg-class="bgClass"
      :loading="loading"
      :is-icon-only="isIconOnly"
      :is-compact="isCompact"
    >
      <VNodes
        v-if="Array.isArray(childVnode.children)"
        :vnodes="(childVnode.children.filter((c) => typeof c === 'object') as any)"
      />
      <template v-else-if="typeof childVnode.children === 'string'">{{
        childVnode.children
      }}</template>
      <slot v-else />
    </ButtonInternals>
  </component>
</template>
