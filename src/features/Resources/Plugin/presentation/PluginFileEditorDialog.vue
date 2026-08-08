<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  Braces,
  Code2,
  Copy,
  Eye,
  FileText,
  Image,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { usePluginStore } from "../application/plugin-store";
import { pluginMediaSource, pluginMediaType } from "../domain/plugin-media";
import { pluginFileType, type Plugin, type PluginFile } from "../domain/plugin-types";
import PluginFileEditorSurface from "./PluginFileEditorSurface.vue";

const props = defineProps<{
  open: boolean;
  plugin: Plugin | null;
  file: PluginFile | null;
  path: string;
  panelOpen: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const pluginStore = usePluginStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
const draft = ref("");
const saving = ref(false);
const errorMessage = ref("");
const savedMessage = ref("");
const editorMode = ref<"preview" | "source">("preview");
const dialog = ref<HTMLElement | null>(null);
const dialogSize = ref({ width: 600, height: 720 });
let stopResize: (() => void) | null = null;

const dialogStyle = computed(() => isMobileLayout.value
  ? undefined
  : {
      width: `${dialogSize.value.width}px`,
      height: `${dialogSize.value.height}px`,
    });

const fileType = computed(() => props.file ? pluginFileType(props.file.name) : "text");
const isMedia = computed(() => fileType.value === "media");
const mediaKind = computed(() => props.file
  ? pluginMediaType(props.file.content, pluginMediaSource(props.file.content))
  : "image");
const fileIcon = computed(() => {
  if (fileType.value === "javascript" || fileType.value === "component") return Code2;
  if (["json", "chat", "data"].includes(fileType.value)) return Braces;
  if (fileType.value === "media") return Image;
  return FileText;
});
const editorStats = computed(() => ({
  characters: draft.value.length,
  lines: draft.value ? draft.value.split(/\r?\n/).length : 0,
}));

function serializeContent(file: PluginFile | null) {
  if (!file) return "";
  return typeof file.content === "string"
    ? file.content
    : JSON.stringify(file.content, null, 2);
}

function restoreDraft() {
  draft.value = serializeContent(props.file);
  errorMessage.value = "";
  savedMessage.value = "";
  editorMode.value = ["javascript", "component", "json", "data"].includes(fileType.value)
    ? "source"
    : "preview";
}

async function save() {
  if (!props.plugin || !props.file || isMedia.value) return;
  saving.value = true;
  errorMessage.value = "";
  savedMessage.value = "";
  try {
    let content: unknown = draft.value;
    if (["json", "chat", "data"].includes(fileType.value)) {
      content = JSON.parse(draft.value) as unknown;
    }
    await pluginStore.updateNode(props.plugin.id, props.file.id, { content });
    savedMessage.value = "已保存";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

async function setEnabled(enabled: boolean) {
  if (!props.plugin) return;
  await pluginStore.updatePlugin(props.plugin.id, { enabled });
}

async function copyPath() {
  if (!props.plugin) return;
  await navigator.clipboard?.writeText(`${props.plugin.id}/${props.path}`);
  savedMessage.value = "路径已复制";
}

function startResize(event: PointerEvent) {
  if (isMobileLayout.value || !dialog.value) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = dialog.value.getBoundingClientRect();

  const move = (moveEvent: PointerEvent) => {
    const panelAllowance = props.panelOpen ? 304 : 16;
    dialogSize.value = {
      width: Math.min(
        Math.max(420, startRect.width + moveEvent.clientX - startX),
        Math.max(420, window.innerWidth - panelAllowance),
      ),
      height: Math.min(
        Math.max(420, startRect.height + moveEvent.clientY - startY),
        Math.max(420, window.innerHeight - 16),
      ),
    };
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    stopResize = null;
  };
  stopResize?.();
  stopResize = stop;
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
}

onBeforeUnmount(() => stopResize?.());

watch(
  () => [props.file?.id, props.open] as const,
  () => {
    if (props.open) restoreDraft();
  },
  { immediate: true },
);
</script>

<template>
  <Teleport to="body">
    <section
      v-if="open && plugin && file"
      ref="dialog"
      role="dialog"
      aria-modal="false"
      :aria-labelledby="`plugin-file-title-${file.id}`"
      :aria-describedby="`plugin-file-path-${file.id}`"
      class="plugin-file-dialog fixed top-1/2 z-50 flex max-h-[calc(100dvh-1rem)] min-h-[420px] max-w-[calc(100vw-19rem)] min-w-[420px] -translate-y-1/2 flex-col overflow-hidden rounded-3xl bg-popover/90 text-base shadow-2xl ring-1 ring-border/80 backdrop-blur-xl mobile:inset-2 mobile:h-auto mobile:max-h-[calc(100dvh-1rem)] mobile:w-auto mobile:max-w-none mobile:min-h-0 mobile:min-w-0 mobile:translate-y-0"
      :class="panelOpen ? 'right-[19rem]' : 'left-1/2 -translate-x-1/2 mobile:translate-x-0'"
      :style="dialogStyle"
    >
      <header class="flex min-h-16 shrink-0 items-center gap-3 border-b border-border/80 px-4">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border/80">
          <component :is="fileIcon" class="size-5" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 :id="`plugin-file-title-${file.id}`" class="truncate text-base font-semibold">{{ file.name }}</h2>
          <p :id="`plugin-file-path-${file.id}`" class="mt-0.5 truncate text-xs text-muted-foreground">{{ plugin.name }} / {{ path }}</p>
        </div>
        <Switch :model-value="plugin.enabled" :aria-label="plugin.enabled ? '停用插件' : '启用插件'" @update:model-value="setEnabled" />
        <div v-if="!isMedia" class="flex rounded-lg border bg-muted/20 p-0.5">
          <Button :variant="editorMode === 'preview' ? 'secondary' : 'ghost'" size="icon-sm" title="组件视图" @click="editorMode = 'preview'"><Eye class="size-4" /></Button>
          <Button :variant="editorMode === 'source' ? 'secondary' : 'ghost'" size="icon-sm" title="源码视图" @click="editorMode = 'source'"><Code2 class="size-4" /></Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="更多文件操作">
              <MoreHorizontal class="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuItem @click="copyPath"><Copy class="mr-2 size-4" />复制路径</DropdownMenuItem>
            <DropdownMenuItem :disabled="isMedia" @click="restoreDraft"><RotateCcw class="mr-2 size-4" />恢复内容</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="关闭文件编辑器" @click="emit('update:open', false)">
          <X class="size-5" />
        </Button>
      </header>

      <div class="min-h-0 flex-1 p-3">
        <div class="h-full overflow-hidden rounded-xl border border-border/80 bg-transparent">
          <PluginFileEditorSurface
            :plugin="plugin"
            :file="file"
            :path="path"
            :model-value="draft"
            :mode="editorMode"
            @update:model-value="draft = $event"
          />
        </div>
      </div>

      <footer class="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-border/80 px-4">
        <div class="min-w-0 text-xs text-muted-foreground">
          <span v-if="!isMedia">{{ editorStats.characters }} 字符 · {{ editorStats.lines }} 行</span>
          <span v-else>{{ mediaKind === 'video' ? '视频' : '图片' }}</span>
          <span v-if="errorMessage" class="ml-2 text-destructive">{{ errorMessage }}</span>
          <span v-else-if="savedMessage" class="ml-2 text-emerald-500">{{ savedMessage }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" @click="emit('update:open', false)">取消</Button>
          <Button v-if="!isMedia" size="sm" :disabled="saving" @click="save">{{ saving ? "保存中" : "保存" }}</Button>
        </div>
      </footer>

      <div
        v-if="!isMobileLayout"
        role="separator"
        aria-label="调整资源窗口大小"
        class="absolute bottom-0 right-0 z-10 size-5 cursor-se-resize touch-none"
        @pointerdown="startResize"
      >
        <span class="absolute bottom-1 right-1 block size-2.5 border-b-2 border-r-2 border-muted-foreground/45" />
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
@media (max-width: 767px) {
  .plugin-file-dialog {
    max-height: calc(100dvh - 1rem);
  }
}
</style>
