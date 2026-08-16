<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ImageOff } from "lucide-vue-next";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const props = withDefaults(defineProps<{
  src?: string;
  alt?: string;
  preview?: boolean;
  objectFit?: "cover" | "contain";
  class?: string;
  imageClass?: string;
}>(), {
  src: "",
  alt: "",
  preview: true,
  objectFit: "cover",
  class: "",
  imageClass: "",
});

const failed = ref(false);
const open = ref(false);
const objectFitClass = computed(() => props.objectFit === "contain" ? "object-contain" : "object-cover");

watch(() => props.src, () => {
  failed.value = false;
  open.value = false;
});
</script>

<template>
  <div :class="cn('relative overflow-hidden rounded-md bg-muted/40', props.class)">
    <button
      v-if="!failed && src && preview"
      type="button"
      :class="cn('block size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')"
      :aria-label="`预览${alt || '图片'}`"
      @click="open = true"
    >
      <img
        :src="src"
        :alt="alt"
        :class="cn('size-full max-h-full max-w-full', objectFitClass, props.imageClass)"
        loading="lazy"
        @error="failed = true"
      >
    </button>
    <img
      v-else-if="!failed && src"
      :src="src"
      :alt="alt"
      :class="cn('block size-full max-h-full max-w-full', objectFitClass, props.imageClass)"
      loading="lazy"
      @error="failed = true"
    >
    <div v-else class="flex size-full min-h-20 items-center justify-center gap-2 px-3 text-xs text-muted-foreground">
      <ImageOff class="size-4" />
      <span>图片不可用</span>
    </div>
  </div>

  <Dialog v-if="preview" v-model:open="open">
    <DialogContent class="flex h-[min(90dvh,56rem)] max-w-[min(96vw,80rem)] items-center justify-center overflow-hidden bg-background/95 p-3">
      <DialogTitle class="sr-only">{{ alt || '图片预览' }}</DialogTitle>
      <DialogDescription class="sr-only">可缩放查看图片资源。</DialogDescription>
      <img :src="src" :alt="alt" class="max-h-full max-w-full select-none object-contain" draggable="false">
    </DialogContent>
  </Dialog>
</template>
