<script setup lang="ts">
import { computed, type HTMLAttributes, type VNode } from "vue";
import { motion } from "motion-v";
import { cn } from "../../../lib/utils";
import { spring } from "../../../lib/springs";
import { useShape } from "../../../lib/shape-context";
import { useSize, type SizeVariant } from "../../../lib/size-context";
import { useTouchPrimary } from "../../../hooks/use-touch-primary";
import FileThumbnail from "./FileThumbnail.vue";

// ─── ChatMessage ──────────────────────────────────────────────────────────
// 单条聊天记录，内建入场 + 布局动效。与 InputMessage 的 send 配对使用：
// 每条收发的消息渲染一个。`layout="position"` 让追加新消息时更早的消息
// 平滑上移。

const props = withDefaults(
  defineProps<{
    /** 发送方。驱动对齐与气泡颜色：`user` → 右对齐强调色气泡，
     *  `assistant` → 左对齐纯文本。 */
    from: "user" | "assistant";
    /** 可选附件，渲染为气泡上方的方形缩略图。 */
    files?: File[];
    /** 每个附件缩略图的边长（px）。默认 64。 */
    thumbnailSize?: number;
    /** 悬停显示的 meta 行里、操作之前的時間戳。仅 user 消息有效——
     *  assistant 回复忽略。由调用方预先格式化（如「星期三 18:08」）。 */
    time?: string;
    /** 消息正文。省略时丢弃文本气泡（仅附件的消息）。 */
    class?: HTMLAttributes["class"];
    /** 把消息钉在尺寸阶梯的某一档（见 /docs/sizes）——compact 收紧
     *  气泡字号与内边距。省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    layout?: boolean | "position" | "size";
  }>(),
  { thumbnailSize: 64, layout: false }
);

const slots = defineSlots<{
  default?: () => VNode[];
  /** 悬停显示的 meta 行里的图标操作按钮（复制、编辑、重新生成等）。 */
  actions?: () => VNode[];
}>();

const shape = useShape();
const compact = computed(() => useSize(() => props.size).value.variant === "compact");
const isUser = computed(() => props.from === "user");
// 悬停显示在触控设备上不可达——meta 行保持常显。
const isTouch = useTouchPrimary();
// 时间戳是 user 消息的专属；assistant 回复只显示操作。
const showTime = computed(() => isUser.value && props.time != null);
const hasActions = computed(() => !!slots.actions);
const hasBody = computed(() => !!slots.default);

const rootClass = computed(() =>
  cn(
    "group/message flex max-w-[80%] flex-col gap-1.5",
    isUser.value ? "items-end self-end ml-auto w-fit" : "items-start self-start w-full",
    props.class
  )
);

const bodyClass = computed(() =>
  cn(
    "whitespace-pre-wrap break-words",
    compact.value ? "py-1.5 text-[13px]" : "py-2 text-[14px]",
    // user 保留气泡外观（圆角填充 + 横向内边距）；assistant 回复是
    // 左对齐纯文本、无背景。text-pretty 只用于已定稿的 user 气泡——
    // assistant 流式输出时 text-wrap: pretty 会在每次内容变化时重排
    // 最后一行，逐词生长的文本会明显抖动；默认换行从左到右追加、保持不动。
    isUser.value
      ? cn(
          shape.value.bg,
          compact.value ? "px-3" : "px-3.5",
          "text-pretty bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] text-accent-foreground"
        )
      : "w-full text-foreground"
  )
);

const metaClass = computed(() =>
  cn(
    "flex select-none items-center gap-2 px-1 leading-none text-muted-foreground",
    compact.value ? "text-[11px]" : "text-[12px]",
    !isUser.value
      ? "opacity-100 pointer-events-auto"
      : !isTouch.value && [
          "pointer-events-none opacity-0 transition-opacity duration-150",
          "group-hover/message:pointer-events-auto group-hover/message:opacity-100",
          "group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100",
        ]
  )
);

const showMetaRow = computed(() => showTime.value || hasActions.value);
</script>

<template>
  <motion.div
    :class="rootClass"
    :layout="props.layout || undefined"
    :initial="{ opacity: 0, y: 8, scale: 0.96 }"
    :animate="{ opacity: 1, y: 0, scale: 1 }"
    :transition="spring.moderate"
    :style="{ transformOrigin: isUser ? 'bottom right' : 'bottom left' }"
  >
    <div
      v-if="files && files.length > 0"
      :class="cn('flex flex-wrap gap-1.5', isUser ? 'justify-end' : 'justify-start')"
    >
      <FileThumbnail
        v-for="(file, i) in files"
        :key="`${file.name}-${file.size}-${file.lastModified}-${i}`"
        :file="file"
        :size="thumbnailSize"
      />
    </div>
    <div v-if="hasBody" :class="bodyClass">
      <slot />
    </div>
    <div v-if="showMetaRow" :class="metaClass">
      <span v-if="showTime" class="tabular-nums">{{ time }}</span>
      <span v-if="hasActions" class="flex items-center gap-0.5">
        <slot name="actions" />
      </span>
    </div>
  </motion.div>
</template>
