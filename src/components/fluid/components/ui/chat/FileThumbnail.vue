<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";

// ─── File thumbnail ───────────────────────────────────────────────────────
// 只读的方形文件预览。图片用 `URL.createObjectURL` 的 object-cover；
// PDF 首页渲染需要 pdfjs-dist——这里不强依赖：若宿主环境恰好装了它
// （动态导入成功）就渲染首页，否则回退通用文档图标。解析期间显示
// 细环 spinner。自足（边框 + 表面 + 尺寸内建），既能用于输入框的附件
// 预览行，也能用于聊天记录里已发送的附件。

const props = defineProps<{
  file: File;
  /** 方形缩略图边长（px）。 */
  size: number;
  class?: string;
}>();

const shape = useShape();
const isImage = computed(() => props.file.type.startsWith("image/"));
const isPdf = computed(() => props.file.type === "application/pdf");

// blob URL 的创建与撤销放在同一个 watch cleanup 里，保证 file prop 替换
// 或组件卸载时不会留下失效的 URL。
const imageUrl = ref<string | null>(null);
watch(
  () => [isImage.value, props.file] as const,
  ([img, file], _prev, onCleanup) => {
    if (!img) {
      imageUrl.value = null;
      return;
    }
    const url = URL.createObjectURL(file);
    imageUrl.value = url;
    onCleanup(() => URL.revokeObjectURL(url));
  },
  { immediate: true }
);

const pdfUrl = ref<string | null>(null);
const pdfError = ref(false);
watch(
  () => [isPdf.value, props.file, props.size] as const,
  async ([pdf, file], _prev, onCleanup) => {
    pdfError.value = false;
    if (!pdf) {
      pdfUrl.value = null;
      return;
    }
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    try {
      // 可选依赖：用变量说明符 + @vite-ignore，构建器不解析也不打包，
      // 宿主没装 pdfjs 时走通用图标回退。
      const specifier = "pdfjs-dist";
      const mod: any = await import(/* @vite-ignore */ specifier);
      if (!mod.GlobalWorkerOptions.workerSrc) {
        mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      }
      const buffer = await file.arrayBuffer();
      const pdfDoc = await mod.getDocument({ data: buffer }).promise;
      const page = await pdfDoc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = (props.size * 2) / base.width; // 2× retina
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport } as any).promise;
      if (!cancelled) pdfUrl.value = canvas.toDataURL("image/png");
    } catch {
      if (!cancelled) pdfError.value = true;
    }
  },
  { immediate: true }
);

const previewUrl = computed(() => imageUrl.value ?? pdfUrl.value);
// 只有预览确实在解析中才显示 spinner；无法出图的（失败 PDF、不支持的
// 类型）直接显示通用图标。
const isPending = computed(
  () =>
    (isImage.value && !imageUrl.value) ||
    (isPdf.value && !pdfUrl.value && !pdfError.value)
);

const glyphSize = computed(() => Math.max(16, props.size * 0.35));

const rootClass = computed(() =>
  cn("relative shrink-0 overflow-hidden bg-accent border border-border", shape.value.bg, props.class)
);
</script>

<template>
  <div :class="rootClass" :style="{ width: `${size}px`, height: `${size}px` }">
    <img
      v-if="previewUrl"
      :src="previewUrl"
      :alt="file.name"
      class="absolute inset-0 h-full w-full object-cover"
    />
    <div
      v-else-if="isPending"
      class="absolute inset-0 flex items-center justify-center"
    >
      <div
        class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-muted-foreground"
        aria-label="Loading preview"
        role="status"
      />
    </div>
    <div
      v-else
      class="absolute inset-0 flex items-center justify-center text-muted-foreground"
      role="img"
      :aria-label="file.name"
    >
      <svg
        :width="glyphSize"
        :height="glyphSize"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    </div>
  </div>
</template>
