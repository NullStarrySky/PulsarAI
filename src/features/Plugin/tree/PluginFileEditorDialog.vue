<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import interact from "interactjs";
import { Braces, Code2, Eye, FileText, Image, SlidersHorizontal, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/components/ui/number-field";
import { useResponsiveStore } from "@/features/Misc/responsive-store";
import { usePackageStore } from "@/features/Package/package-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { useSlotStore, pluginFileMatchesSlotSuffix } from "@/features/Plugin/tree/slot-store";
import { pluginMediaSource, pluginMediaType } from "@/features/Plugin/editors/media/plugin-media";
import { pluginConventions, pluginFileType, type Plugin, type PluginFile } from "@/features/Plugin/tree/plugin-types";
import PluginFileEditorSurface from "@/features/Plugin/editors/PluginFileEditorSurface.vue";
import PluginInsertionConditionEditor from "@/features/Plugin/tree/PluginInsertionConditionEditor.vue";

const AUTO_SAVE_INTERVAL = 800;

const props = defineProps<{
  open: boolean;
  plugin: Plugin | null;
  file: PluginFile | null;
  path: string;
  panelOpen: boolean;
  initialMode?: "preview" | "source";
  packageId?: string;
}>();

const emit = defineEmits<{ "update:open": [value: boolean] }>();
const pluginStore = usePluginStore();
const packages = usePackageStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);

const draft = ref("");
const editorMode = ref<"preview" | "source">(props.initialMode ?? "preview");

watch(() => props.initialMode, (newMode) => {
  if (newMode) {
    editorMode.value = newMode;
  }
});
const insertionTarget = ref("none");
const insertionCondition = ref("");
const insertionConditionPath = ref("");
const resourceOrder = ref(100);
const errorMessage = ref("");
const lastSavedAt = ref("");
const conditionOpen = ref(false);
const dialog = ref<HTMLElement | null>(null);
const frame = ref({ x: 0, y: 0, width: 680, height: 720 });
let restoring = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dialogInteractable: ReturnType<typeof interact> | null = null;


const fileType = computed(() => props.file ? pluginFileType(props.file.name) : "text");
const normalizedPath = computed(() => props.path.toLocaleLowerCase());
const previewAvailable = computed(() => (
  ["markdown", "chat", "component", "media"].includes(fileType.value)
  || normalizedPath.value === pluginConventions.config.toLocaleLowerCase()
  || normalizedPath.value === pluginConventions.slots.toLocaleLowerCase()
  || normalizedPath.value === pluginConventions.regex.toLocaleLowerCase()
));
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
const visiblePlugins = computed(() => pluginStore.sortedPluginsForPackage(
  props.packageId ?? props.plugin?.packageId ?? "",
  packages.packages.find((item) => item.id === (props.packageId ?? props.plugin?.packageId))?.enabledGlobalPluginIds,
  packages.packages.find((item) => item.id === (props.packageId ?? props.plugin?.packageId))?.mainPluginId,
));
const slotStore = useSlotStore();
const slotOptions = computed(() => {
  const plugin = props.plugin;
  const file = props.file;
  if (!plugin || !file) return [];
  const plugins = visiblePlugins.value.some((item: Plugin) => item.id === plugin.id)
    ? visiblePlugins.value
    : [plugin, ...visiblePlugins.value];
  return slotStore.listSlots(plugins).flatMap((slot) => {
    if (!pluginFileMatchesSlotSuffix(file.name, slot.contentSuffixes)) return [];
    if (slot.scope !== "global" && slot.pluginId !== plugin.id) return [];
    return [{
      value: `slot:${slot.scope}/${slot.id}`,
      title: slot.title,
      description: slot.description || "无说明",
    }];
  });
});
const selectedSlotTitle = computed(() => slotOptions.value.find(
  (slot) => slot.value === insertionTarget.value,
)?.title ?? "不插入");
const dialogStyle = computed(() => ({
  width: `${frame.value.width}px`,
  height: `${frame.value.height}px`,
  transform: `translate(${frame.value.x}px, ${frame.value.y}px)`,
}));
const saveStatus = computed(() => {
  if (errorMessage.value) return errorMessage.value;
  return `上次保存：${lastSavedAt.value || "—"}`;
});

function serializeContent(file: PluginFile | null) {
  if (!file) return "";
  return typeof file.content === "string" ? file.content : JSON.stringify(file.content, null, 2);
}

function restoreDraft() {
  restoring = true;
  draft.value = serializeContent(props.file);
  insertionTarget.value = props.file?.insertion?.slot ?? "none";
  insertionCondition.value = props.file?.insertion?.condition ?? "";
  insertionConditionPath.value = props.file?.insertion?.conditionPath ?? "";
  resourceOrder.value = props.file?.order ?? 100;
  errorMessage.value = "";
  lastSavedAt.value = "";
  editorMode.value = previewAvailable.value ? "preview" : "source";
  resetFrame();
  void nextTick(() => { restoring = false; });
}

function resetFrame() {
  const margin = 16;
  const maxWidth = Math.max(320, window.innerWidth - margin);
  const maxHeight = Math.max(320, window.innerHeight - margin);
  const width = isMobileLayout.value ? maxWidth : Math.min(680, maxWidth);
  const height = isMobileLayout.value ? maxHeight : Math.min(720, maxHeight);
  frame.value = {
    x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(8, Math.round((window.innerHeight - height) / 2)),
    width,
    height,
  };
}

function teardownInteraction() {
  dialogInteractable?.unset();
  dialogInteractable = null;
}

function setupInteraction() {
  teardownInteraction();
  const target = dialog.value;
  if (!target || isMobileLayout.value) return;
  dialogInteractable = interact(target)
    .draggable({
      allowFrom: ".plugin-file-drag-handle",
      ignoreFrom: ".plugin-file-control",
      modifiers: [
        interact.modifiers.restrictRect({
          restriction: "parent",
          elementRect: { left: 0, right: 1, top: 0, bottom: 1 },
        }),
      ],
      listeners: {
        move(event) {
          frame.value = {
            ...frame.value,
            x: frame.value.x + event.dx,
            y: frame.value.y + event.dy,
          };
        },
      },
    })
    .resizable({
      edges: { left: true, right: true, top: true, bottom: true },
      margin: 8,
      modifiers: [
        interact.modifiers.restrictEdges({ outer: "parent" }),
        interact.modifiers.restrictSize({ min: { width: 420, height: 420 } }),
      ],
      listeners: {
        move(event) {
          const deltaRect = event.deltaRect ?? { left: 0, top: 0 };
          frame.value = {
            x: frame.value.x + deltaRect.left,
            y: frame.value.y + deltaRect.top,
            width: event.rect.width,
            height: event.rect.height,
          };
        },
      },
    });
}

async function saveNow() {
  const plugin = props.plugin;
  const file = props.file;
  if (!plugin || !file) return true;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  errorMessage.value = "";
  try {
    let content: unknown = isMedia.value ? file.content : draft.value;
    if (!isMedia.value && ["json", "chat", "data"].includes(fileType.value)) {
      content = JSON.parse(draft.value) as unknown;
    }
    await pluginStore.updateNode(plugin.id, file.id, {
      content,
      order: Number(resourceOrder.value),
      insertion: insertionTarget.value === "none"
        ? undefined
        : {
            slot: insertionTarget.value.replace(/^slot:[^/]+\//, ""),
            condition: insertionCondition.value.trim() || undefined,
            conditionPath: insertionConditionPath.value.trim() || undefined,
          },
    });
    lastSavedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    return true;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "自动保存失败";
    return false;
  }
}

function scheduleSave() {
  if (restoring || !props.open) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveNow(); }, AUTO_SAVE_INTERVAL);
}

function updateInsertion(value: unknown) {
  insertionTarget.value = String(value ?? "none");
  if (insertionTarget.value === "none") {
    insertionCondition.value = "";
    insertionConditionPath.value = "";
  }
  scheduleSave();
}

function updateCondition(value: string) {
  insertionCondition.value = value;
  scheduleSave();
}

function updateConditionPath(value: string) {
  insertionConditionPath.value = value;
  scheduleSave();
}

function updateOrder(value: number | undefined) {
  resourceOrder.value = Number.isFinite(value) ? Number(value) : 100;
  scheduleSave();
}

async function closeEditor() {
  if (!(await saveNow())) return;
  emit("update:open", false);
}

watch(draft, scheduleSave);
watch(
  () => [props.file?.id, props.open] as const,
  async () => {
    teardownInteraction();
    if (!props.open) return;
    restoreDraft();
    await nextTick();
    setupInteraction();
  },
  { immediate: true },
);
watch(isMobileLayout, async () => {
  if (!props.open) return;
  resetFrame();
  await nextTick();
  setupInteraction();
});

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  teardownInteraction();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open && plugin && file" class="pointer-events-none fixed inset-0 z-50">
        <section
          ref="dialog"
          role="dialog"
          aria-modal="false"
          :aria-labelledby="`plugin-file-title-${file.id}`"
          :style="dialogStyle"
          class="plugin-file-dialog pointer-events-auto absolute left-0 top-0 flex min-h-0 flex-col overflow-hidden rounded-3xl bg-popover/90 text-base shadow-2xl ring-1 ring-border/80 backdrop-blur-xl"
        >
          <header class="plugin-file-drag-handle flex min-h-16 shrink-0 cursor-move flex-wrap items-center gap-2 border-b border-border/80 px-4 py-2 mobile:cursor-default">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-border/80">
              <component :is="fileIcon" />
            </div>
            <div class="min-w-28 flex-1">
              <h2 :id="`plugin-file-title-${file.id}`" class="truncate text-sm font-semibold">{{ file.name }}</h2>
              <p class="truncate text-xs text-muted-foreground">{{ plugin.name }} / {{ path }}</p>
            </div>

            <div class="plugin-file-control contents">
              <Select :model-value="insertionTarget" @update:model-value="updateInsertion">
                <SelectTrigger class="h-8 w-fit max-w-40 text-xs" aria-label="插入位置">
                  <SelectValue placeholder="不插入">{{ selectedSlotTitle }}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">不插入</SelectItem>
                    <SelectItem v-for="slot in slotOptions" :key="slot.value" :value="slot.value" :text-value="slot.title">
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="truncate text-xs">{{ slot.title }}</span>
                        <span class="truncate text-[10px] text-muted-foreground">{{ slot.description }}</span>
                      </span>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              <template v-if="insertionTarget !== 'none'">
                <Popover v-model:open="conditionOpen">
                  <PopoverTrigger as-child>
                    <Button variant="outline" size="sm" class="h-8" title="插入条件">
                      <SlidersHorizontal data-icon="inline-start" />
                      条件
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" class="w-[min(32rem,calc(100vw-1rem))] p-4" data-no-window-drag>
                    <div class="grid gap-3">
                      <PluginInsertionConditionEditor :model-value="insertionCondition" @update:model-value="updateCondition" />
                      <label class="grid gap-1.5">
                        <span class="text-xs font-medium">条件脚本（可选）</span>
                        <Input
                          :model-value="insertionConditionPath"
                          class="h-8 font-mono text-xs"
                          placeholder="@/conditions/visible.js"
                          @update:model-value="updateConditionPath(String($event ?? ''))"
                        />
                        <span class="text-[11px] text-muted-foreground">相对当前文件解析；脚本必须同步返回 boolean。</span>
                      </label>
                    </div>
                  </PopoverContent>
                </Popover>

                <NumberField :model-value="resourceOrder" :step="1" class="w-28" @update:model-value="updateOrder">
                  <NumberFieldContent>
                    <NumberFieldDecrement />
                    <NumberFieldInput aria-label="容器优先级" class="h-8 text-xs" />
                    <NumberFieldIncrement />
                  </NumberFieldContent>
                </NumberField>
              </template>

              <div v-if="previewAvailable && !isMedia" class="flex rounded-lg border bg-muted/20 p-0.5" data-no-window-drag>
                <Button :variant="editorMode === 'preview' ? 'secondary' : 'ghost'" size="icon-sm" title="组件视图" @click="editorMode = 'preview'"><Eye /></Button>
                <Button :variant="editorMode === 'source' ? 'secondary' : 'ghost'" size="icon-sm" title="源码视图" @click="editorMode = 'source'"><Code2 /></Button>
              </div>
              <Button variant="ghost" size="icon-sm" class="rounded-full" aria-label="关闭文件编辑器" @click="closeEditor"><X /></Button>
            </div>
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

          <footer class="flex min-h-11 shrink-0 items-center justify-between gap-3 border-t border-border/80 px-4 text-xs text-muted-foreground">
            <span v-if="!isMedia">{{ editorStats.characters }} 字符 · {{ editorStats.lines }} 行</span>
            <span v-else>{{ mediaKind === 'video' ? '视频' : '图片' }}</span>
            <span class="ml-auto" :class="errorMessage && 'text-destructive'">{{ saveStatus }}</span>
          </footer>

        </section>
    </div>
  </Teleport>
</template>

<style scoped>
.plugin-file-drag-handle {
  touch-action: none;
  user-select: none;
}

@media (max-width: 767px) {
  .plugin-file-dialog {
    max-height: calc(100dvh - 1rem);
  }
}
</style>
