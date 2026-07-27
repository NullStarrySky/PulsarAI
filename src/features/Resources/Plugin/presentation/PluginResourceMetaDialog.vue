<script setup lang="ts">
import { reactive, watch } from "vue";
import { Trash2, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PluginResource, PluginResourceContainer } from "@/features/Resources/Plugin/domain/plugin-types";
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
const draft = reactive({
  name: "",
  icon: "",
  description: "",
  metaText: "",
  isTemplate: false,
});

watch(
  () => [props.open, props.resource?.id],
  () => {
    if (!props.open || !props.resource) {
      return;
    }
    draft.name = props.resource.name;
    draft.icon = props.resource.icon;
    draft.description = props.resource.description;
    draft.metaText = JSON.stringify(props.resource.meta ?? {}, null, 2);
    draft.isTemplate = props.resource.isTemplate;
  },
  { immediate: true },
);

function parseMeta() {
  try {
    const value = JSON.parse(draft.metaText || "{}");
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function save() {
  if (!props.container || !props.resource) {
    return;
  }
  await pluginStore.updateResource(props.pluginId, props.container.id, props.resource.id, {
    name: draft.name.trim() || props.resource.name,
    icon: draft.icon.trim(),
    description: draft.description.trim(),
    isTemplate: draft.isTemplate,
    meta: parseMeta(),
  });
  emit("update:open", false);
}

async function deleteResource() {
  if (!props.container || !props.resource) {
    return;
  }
  await pluginStore.deleteResource(props.pluginId, props.container.id, props.resource.id);
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent :show-close-button="false" class="w-[min(640px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-2xl sm:max-w-none">
      <header class="flex h-14 items-center justify-between px-5">
        <h2 class="text-base font-semibold">资源元信息</h2>
        <Button size="icon" variant="ghost" class="size-8" title="关闭" @click="emit('update:open', false)">
          <X class="size-4" />
        </Button>
      </header>

      <div class="grid max-h-[min(640px,72vh)] gap-5 overflow-y-auto px-5 py-3 [scrollbar-gutter:stable]">
        <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <label class="grid gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">名称</span>
            <Input v-model="draft.name" class="h-9 rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder="资源名称" />
          </label>
          <label class="grid gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">图标</span>
            <Input v-model="draft.icon" class="h-9 rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder="URL，可留空" />
          </label>
        </div>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">描述</span>
          <Textarea v-model="draft.description" class="min-h-16 resize-none rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder="可留空" />
        </label>
        <label class="flex min-h-11 items-center justify-between rounded-md bg-muted/25 px-3 text-sm">
          <span>作为模板</span>
          <Switch v-model="draft.isTemplate" />
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">扩展元信息</span>
          <Textarea
            v-model="draft.metaText"
            class="min-h-36 resize-none rounded-none border-0 border-b bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
            placeholder="JSON"
          />
        </label>
      </div>

      <DialogFooter class="px-5 pb-5 pt-4">
        <Button variant="ghost" class="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive" @click="deleteResource">
          <Trash2 data-icon="inline-start" />
          删除
        </Button>
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button @click="save">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
