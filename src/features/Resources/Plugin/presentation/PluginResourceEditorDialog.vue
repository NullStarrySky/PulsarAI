<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import type { PluginResource, PluginResourceContainer } from "@/features/Resources/Plugin/domain/plugin-types";
import {
  createPluginMediaContent,
  pluginMediaSource,
  pluginMediaType,
  type PluginMediaType,
} from "@/features/Resources/Plugin/domain/plugin-media";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";

const props = defineProps<{
  open: boolean;
  pluginId: string;
  container?: PluginResourceContainer | null;
  resource?: PluginResource | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const pluginStore = usePluginStore();
const contentRoot = ref<HTMLElement | null>(null);
const draft = ref("");
const enabledDraft = ref(false);
const mediaUrl = ref("");
const mediaType = ref<PluginMediaType>("image");
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const resourceType = computed(() => props.container?.contentControl.resourcesType ?? "markdown");
const contentTitle = computed(() => props.resource?.name || "资源内容");
const liveContainer = computed(() => {
  if (!props.container) {
    return null;
  }
  return pluginStore.plugins
    .find((plugin) => plugin.id === props.pluginId)
    ?.resources.find((container) => container.id === props.container?.id) ?? props.container;
});
const liveResource = computed(() => {
  if (!props.resource || !liveContainer.value) {
    return null;
  }
  return liveContainer.value.resources.find((resource) => resource.id === props.resource?.id) ?? props.resource;
});

watch(
  () => [props.open, props.resource?.id],
  () => {
    if (!props.open || !props.resource) {
      return;
    }
    draft.value = stringifyContent(props.resource.content);
    mediaUrl.value = pluginMediaSource(props.resource.content);
    mediaType.value = pluginMediaType(props.resource.content);
  },
  { immediate: true },
);

watch(
  () => [props.open, liveResource.value?.id, liveResource.value?.enabled],
  () => {
    enabledDraft.value = Boolean(liveResource.value?.enabled);
  },
  { immediate: true },
);

watch(draft, () => {
  if (!props.open || !props.container || !props.resource || resourceType.value === "media") {
    return;
  }
  scheduleSave(parseContent());
});

watch([mediaUrl, mediaType], () => {
  if (!props.open || !props.container || !props.resource || resourceType.value !== "media") {
    return;
  }
  scheduleSave(createPluginMediaContent(mediaUrl.value.trim(), mediaType.value));
});

function scheduleSave(content: unknown) {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    if (!props.container || !props.resource) {
      return;
    }
    void pluginStore.updateResource(props.pluginId, props.container.id, props.resource.id, {
      content,
    });
  }, 500);
}

function stringifyContent(content: unknown) {
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content ?? "", null, 2);
}

function parseContent() {
  if (
    resourceType.value === "markdown"
    || resourceType.value === "component"
    || resourceType.value === "action"
  ) {
    return draft.value;
  }
  try {
    return JSON.parse(draft.value);
  } catch {
    return draft.value;
  }
}

function focusEditor(event: MouseEvent) {
  if (event.target instanceof HTMLElement && event.target.closest(".ProseMirror, .cm-editor, button, input")) {
    return;
  }
  requestAnimationFrame(() => {
    const editor = contentRoot.value?.querySelector<HTMLElement>(".ProseMirror");
    editor?.focus();
  });
}

async function updateEnabled(checked: boolean) {
  enabledDraft.value = checked;
  if (!props.resource || !liveContainer.value || liveContainer.value.contentControl.selectable === "none") {
    return;
  }
  await pluginStore.toggleResourceEnabled(props.pluginId, liveContainer.value.id, props.resource.id, checked);
  enabledDraft.value = Boolean(liveResource.value?.enabled);
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent
      :show-close-button="false"
      class="grid h-[min(760px,88vh)] w-[min(720px,calc(100vw-32px))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-2xl sm:max-w-none"
    >
      <header class="flex min-h-16 items-center gap-3 px-5 py-3">
        <img v-if="props.resource?.icon" :src="props.resource.icon" alt="" class="size-10 rounded-lg object-cover" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <h2 class="truncate text-lg font-semibold">{{ contentTitle }}</h2>
            <span class="text-xs text-muted-foreground">{{ props.container?.contentControl.resourcesType }}</span>
          </div>
          <p v-if="props.resource?.description" class="mt-0.5 truncate text-sm text-muted-foreground">
            {{ props.resource.description }}
          </p>
        </div>
        <div class="flex h-8 shrink-0 items-center gap-1">
          <Switch
            v-if="liveContainer && props.resource && liveContainer.contentControl.selectable !== 'none'"
            class="mx-2"
            :model-value="enabledDraft"
            @update:model-value="updateEnabled(Boolean($event))"
          />
          <Button size="icon" variant="ghost" class="size-8" title="关闭" @click="emit('update:open', false)">
            <X class="size-4" />
          </Button>
        </div>
      </header>

      <div class="h-full min-h-0 px-5 pb-5">
        <div
          v-if="resourceType === 'markdown'"
          ref="contentRoot"
          class="plugin-resource-content h-full min-h-0 cursor-text overflow-hidden rounded-lg bg-background/55 px-12 py-4"
          @mousedown="focusEditor"
          @click="focusEditor"
        >
          <ConversationComposerEditor v-model="draft" placeholder="编辑 markdown 内容..." enable-block-edit :enable-ai="false" />
        </div>
        <div
          v-else-if="resourceType === 'media'"
          class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3"
        >
          <div class="flex min-h-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            <video
              v-if="mediaUrl && mediaType === 'video'"
              :src="mediaUrl"
              class="h-full w-full object-contain"
              controls
              muted
              playsinline
            />
            <img
              v-else-if="mediaUrl"
              :src="mediaUrl"
              alt=""
              class="h-full w-full object-contain"
            />
            <p v-else class="px-6 text-center text-sm text-muted-foreground">
              填写图片或视频地址后可在这里预览
            </p>
          </div>
          <div class="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 mobile:grid-cols-1">
            <Select v-model="mediaType">
              <SelectTrigger>
                <SelectValue placeholder="媒体类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="video">视频</SelectItem>
              </SelectContent>
            </Select>
            <Input v-model="mediaUrl" placeholder="图片或视频 URL / data URL" />
          </div>
        </div>
        <div
          v-else
          class="h-full min-h-0 overflow-hidden rounded-lg bg-background/55"
        >
          <JavaScriptCodeMirrorEditor
            v-model="draft"
            :language="resourceType === 'action' ? 'javascript' : 'json'"
            frameless
          />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style>
.plugin-resource-content :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 100% !important;
  height: 100% !important;
  max-height: none !important;
}

.plugin-resource-content :where(.conversation-composer-editor, .milkdown, .editor) {
  height: 100% !important;
}
</style>
