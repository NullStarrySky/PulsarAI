<script setup lang="ts">
import {
  computed,
  ref,
  useAttrs,
  useSlots,
  watch,
  type VNode,
} from "vue";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";
import { provideSize, useSize, type SizeVariant } from "../../../lib/size-context";
import { useIcon } from "../../../lib/icon-context";
import { flattenSlotVnodes } from "../../../lib/slot-utils";
import { useCardGroup, provideCardContext } from "./card-context";
import { VNodes } from "../button/VNodes";

const props = withDefaults(
  defineProps<{
    href?: string;
    external?: boolean;
    /** 整卡可点击时拉伸链接/按钮的可访问名称（卡片的可见标题不会自动接上）。 */
    label?: string;
    /** 持久选中状态，叠加在瞬态邻近悬停之上。 */
    selected?: boolean;
    disabled?: boolean;
    /** 在角落显示关闭（✕）按钮。 */
    dismissible?: boolean;
    /** 关闭控件默认只在悬停或持焦时显示，让常驻 ✕ 不与内容竞争。
     *  传 false 让控件始终可见。 @default true */
    dismissOnHover?: boolean;
    onDismiss?: () => void;
    /** 把卡片钉在尺寸阶梯的某一档（见 /docs/sizes）——紧凑档收紧字号与内边距。
     *  省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
  }>(),
  {
    selected: false,
    disabled: false,
    dismissible: false,
    dismissOnHover: true,
  }
);

const attrs = useAttrs();
const slots = useSlots();
const internalRef = ref<HTMLDivElement | null>(null);

defineOptions({ name: "Card" });

const shape = useShape();
// 先对照显式 prop 解析，让卡片自己的内边距与它为子级渲染的 SizeProvider 一致。
const sizeClasses = useSize(() => props.size);
const compact = computed(() => sizeClasses.value.variant === "compact");
const group = useCardGroup();
const XIcon = useIcon("x");

const orientation = computed(() => group?.orientation ?? "card");
const columns = computed(() => group?.columns ?? 1);
const count = computed(() => group?.count.value ?? 1);
const separated = computed(() => group?.separated ?? true);
const divided = computed(() => group?.divided ?? false);
const outlined = computed(() => group?.outlined ?? false);
const activeIndex = computed(() => group?.activeIndex.value ?? null);
const selectedIndex = computed(() => group?.selectedIndex.value ?? -1);

// 组内领取稳定索引（setup 顺序 = 模板顺序）。
const index = ref<number | undefined>(undefined);
if (group) {
  index.value = group.claimIndex();
}

const registerItem = group?.registerItem;
function setCardRef(el: any) {
  internalRef.value = (el?.$el as HTMLDivElement | null) ?? el ?? null;
}

watch(
  [index, internalRef] as const,
  ([idx, el], _prev, onCleanup) => {
    if (idx === undefined || !registerItem) return;
    registerItem(idx, el);
    onCleanup(() => registerItem(idx, null));
  },
  { immediate: true }
);

// 分隔线几何：朝下方/右侧邻居画发丝线，但在 active 或 selected 卡片旁边放下，
// 让高亮与选中填充读起来干净（Table 对行边框用的同一技巧）。
const col = computed(() => (index.value !== undefined ? index.value % columns.value : 0));
const hasBelow = computed(
  () => index.value !== undefined && index.value + columns.value < count.value
);
const hasRight = computed(
  () =>
    index.value !== undefined && col.value < columns.value - 1 && index.value + 1 < count.value
);
const self = computed(() => index.value ?? -1);
const touchesBelow = (i: number) => i === self.value || i === self.value + columns.value;
const touchesRight = (i: number) => i === self.value || i === self.value + 1;
const showBottom = computed(
  () =>
    divided.value &&
    hasBelow.value &&
    !(touchesBelow(activeIndex.value ?? -1) || touchesBelow(selectedIndex.value))
);
const showRight = computed(
  () =>
    divided.value &&
    hasRight.value &&
    !(touchesRight(activeIndex.value ?? -1) || touchesRight(selectedIndex.value))
);

const isInline = computed(() => orientation.value === "inline");
// 通过类型或组件名识别图片子组件，检测与拆分保持一致（即使模块身份漂移）。
const isCardImage = (child: VNode) => {
  const type = child.type as { __name?: string; name?: string } | string;
  return (
    typeof type !== "string" &&
    (type.name === "CardImage" || type.__name === "CardImage")
  );
};
const childVnodes = computed<VNode[]>(() =>
  flattenSlotVnodes(slots.default?.())
);
const hasImage = computed(() => childVnodes.value.some(isCardImage));
const inlineImage = computed(() => isInline.value && hasImage.value);
const imageVnode = computed(() => childVnodes.value.find(isCardImage));
const restVnodes = computed(() =>
  childVnodes.value.filter((part) => part !== imageVnode.value)
);
const clickable = computed(() => !!props.href || !!attrs.onClick);
// 标题字重只跟随持久选中状态——邻近悬停通过高亮填充预览，不靠加粗标签。
const emphasized = computed(() => props.selected);

// 独立卡片（无组）自己是瓦片——总是圆角 + 裁剪。组内时，分离的瓦片只在
// 画可见边框时携带自己的圆角 + 裁剪；无边框的分离瓦片没有可依附的表面，
// 保持不裁剪，媒体读作普通方块；连续分块中的卡片两者都依赖共享的组外框。
const tileShape = computed(() => {
  if (!group) return cn(shape.value.container, "overflow-hidden");
  if (separated.value && outlined.value)
    return cn(shape.value.container, "overflow-hidden border border-border/60");
  return "";
});

provideCardContext({
  emphasized,
  orientation: orientation.value,
  clickable,
  hasImage,
});

provideSize({ size: () => props.size });

const cardClass = computed(() =>
  cn(
    "group/card relative z-10 min-w-0 min-h-[60px]",
    inlineImage.value
      // 图片在左；文本 + 动作乘在旁边居中的列里（见下方 body wrapper）。
      ? cn("flex flex-row items-center", compact.value ? "gap-2.5" : "gap-3")
      : isInline.value
        ? cn("flex flex-row items-center", compact.value ? "gap-2.5 pl-3" : "gap-3 pl-4")
        : cn("flex flex-col", compact.value ? "pb-3" : "pb-4"),
    // 独立（无组）卡片不能依赖组高亮，所以可交互时自带悬停染色。
    !group &&
      clickable.value &&
      !props.disabled &&
      "transition-colors duration-80 hover:bg-hover",
    // inline 行是单行的，角落关闭钮会压在标题尾部：控件存在时 header 让出
    // 右内边距——仅在 on-hover 场景露出时生效。
    props.dismissible &&
      isInline.value &&
      (props.dismissOnHover
        ? "[&:hover_[data-slot=card-header]]:pr-10 [&:focus-within_[data-slot=card-header]]:pr-10"
        : "[&_[data-slot=card-header]]:pr-10"),
    tileShape.value,
    props.disabled && "opacity-50 pointer-events-none",
    attrs.class as string
  )
);

// class 已并入 cardClass、onClick 交给拉伸 overlay，避免双重触发。
const restAttrs = computed(() => {
  const { class: _class, onClick: _onClick, ...rest } = attrs as Record<string, unknown>;
  return rest;
});

function handleOverlayClick() {
  (attrs.onClick as (() => void) | undefined)?.();
}

function handleDismiss() {
  props.onDismiss?.();
}
</script>

<template>
  <div
    :ref="setCardRef"
    data-slot="card"
    :data-proximity-index="index"
    :data-selected="selected || undefined"
    :data-orientation="orientation"
    :aria-disabled="disabled || undefined"
    :class="cardClass"
    v-bind="restAttrs"
  >
    <!-- 持久选中填充 + 分隔线位于静态内容之后（-z-10）；拉伸 overlay（z-20）
        在内容之上让整卡可点击，动作/关闭（z-30）在 overlay 之上保持独立可交互。 -->
    <span
      v-if="selected"
      aria-hidden="true"
      :class="cn('pointer-events-none absolute inset-0 -z-10 bg-active', shape.container)"
    />

    <!-- 无边框邻居之间的分隔线。两条发丝线相遇处，竖线短 1px，
        让横向发丝线拥有交叉像素——否则两条 60% 线会叠加，读起来更亮。 -->
    <span
      v-if="showBottom"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-border/60"
    />
    <span
      v-if="showRight"
      aria-hidden="true"
      :class="
        cn(
          'pointer-events-none absolute right-0 top-0 -z-10 w-px bg-border/60',
          showBottom ? 'bottom-px' : 'bottom-0'
        )
      "
    />

    <!-- 拉伸 overlay 让整卡成为点击目标，同时动作按钮（更高 z）保持独立可点击
        ——在按钮/锚点里嵌套交互元素的无障碍替代方案。禁用卡完全去掉 overlay，
        这样无法被 tab 到也不会被键盘激活（pointer-events-none 只挡鼠标）。 -->
    <a
      v-if="clickable && !disabled && href"
      :href="href"
      :target="external ? '_blank' : undefined"
      :rel="external ? 'noopener noreferrer' : undefined"
      :aria-label="label"
      class="absolute inset-0 z-20 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]"
      @click="handleOverlayClick"
    />
    <button
      v-else-if="clickable && !disabled"
      type="button"
      :aria-label="label"
      :aria-pressed="selected || undefined"
      class="absolute inset-0 z-20 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]"
      @click="handleOverlayClick"
    />

    <!-- inline 图片卡把非图片部分包进居中列，
        让标题、描述、动作紧贴并相对图片垂直居中。 -->
    <template v-if="inlineImage">
      <VNodes v-if="imageVnode" :vnodes="[imageVnode]" />
      <div
        :class="
          cn(
            'flex min-w-0 flex-1 flex-col justify-center gap-2',
            compact ? 'py-2.5 pr-3' : 'py-3.5 pr-4'
          )
        "
      >
        <VNodes :vnodes="restVnodes" />
      </div>
    </template>
    <VNodes v-else :vnodes="childVnodes" />

    <!-- 关闭控件位于拉伸 overlay 之上。 -->
    <button
      v-if="dismissible"
      type="button"
      aria-label="Dismiss"
      :class="
        cn(
          'absolute right-2 top-2 z-30 flex h-7 w-7 cursor-pointer items-center justify-center text-muted-foreground outline-none transition-colors duration-80 hover:text-foreground focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
          hasImage
            ? 'bg-card/70 backdrop-blur-sm hover:bg-card'
            : 'hover:bg-hover',
          dismissOnHover &&
            'pointer-events-none opacity-0 transition-opacity duration-80 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100',
          shape.button
        )
      "
      @click="handleDismiss"
    >
      <XIcon :size="compact ? 13 : 15" :stroke-width="1.5" />
    </button>
  </div>
</template>
