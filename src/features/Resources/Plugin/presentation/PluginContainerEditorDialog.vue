<script setup lang="ts">
import { reactive, watch } from "vue";
import { X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Plugin, PluginResourceContainer, PluginResourceSelectable } from "@/features/Resources/Plugin/domain/plugin-types";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";

const props = defineProps<{
  open: boolean;
  plugin?: Plugin | null;
  container?: PluginResourceContainer | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

const pluginStore = usePluginStore();
const draft = reactive({
  name: "",
  icon: "",
  selectable: "none" as PluginResourceSelectable,
  insertable: false,
  templatable: false,
  importable: false,
  resourcesType: "markdown",
  importConverter: "",
  defaultResource: "",
  allowFolder: false,
});

watch(
  () => [props.open, props.container?.id],
  () => {
    const container = props.container;
    if (!props.open || !container) {
      return;
    }
    draft.name = container.name;
    draft.icon = container.icon;
    draft.selectable = container.contentControl.selectable;
    draft.insertable = container.contentControl.insertable;
    draft.templatable = container.contentControl.templatable;
    draft.importable = container.contentControl.importable;
    draft.resourcesType = container.contentControl.resourcesType;
    draft.importConverter = container.contentControl.importConverter ?? "";
    draft.defaultResource = stringifyDefault(container.contentControl.defaultResource);
    draft.allowFolder = container.contentControl.allowFolder;
  },
  { immediate: true },
);

function stringifyDefault(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value ?? "", null, 2);
}

function parseDefault() {
  if (draft.resourcesType === "markdown" || draft.resourcesType === "component") {
    return draft.defaultResource;
  }
  try {
    return JSON.parse(draft.defaultResource);
  } catch {
    return draft.defaultResource;
  }
}

async function save() {
  if (!props.plugin || !props.container) {
    return;
  }
  props.container.name = draft.name.trim() || props.container.name;
  props.container.icon = draft.icon.trim();
  props.container.contentControl = {
    ...props.container.contentControl,
    selectable: draft.selectable,
    insertable: draft.insertable,
    templatable: draft.templatable,
    importable: draft.importable,
    resourcesType: draft.resourcesType,
    importConverter: draft.importConverter.trim() || undefined,
    defaultResource: parseDefault(),
    allowFolder: draft.allowFolder,
  };
  await pluginStore.persistPlugin(props.plugin);
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent :show-close-button="false" class="w-[min(640px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden rounded-xl border-0 bg-card p-0 shadow-2xl sm:max-w-none">
      <header class="flex h-14 items-center justify-between px-5">
        <h2 class="text-base font-semibold">容器属性</h2>
        <Button size="icon" variant="ghost" class="size-8" title="关闭" @click="emit('update:open', false)">
          <X class="size-4" />
        </Button>
      </header>

      <div class="grid max-h-[min(640px,72vh)] gap-5 overflow-y-auto px-5 py-3 [scrollbar-gutter:stable]">
        <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <label class="grid gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">名称</span>
            <Input v-model="draft.name" class="h-9 rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder="容器名称" />
          </label>
          <label class="grid gap-1.5">
            <span class="text-xs font-medium text-muted-foreground">图标</span>
            <Input v-model="draft.icon" class="h-9 rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0" placeholder="URL，可留空" />
          </label>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1.5 text-sm">
            <span class="text-xs font-medium text-muted-foreground">选择方式</span>
            <Select v-model="draft.selectable">
              <SelectTrigger class="h-9 rounded-none border-0 border-b bg-transparent px-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">无</SelectItem>
                <SelectItem value="single">单选</SelectItem>
                <SelectItem value="multi">多选</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label class="grid gap-1.5 text-sm">
            <span class="text-xs font-medium text-muted-foreground">资源类型</span>
            <Input v-model="draft.resourcesType" class="h-9 rounded-none border-0 border-b bg-transparent px-0 shadow-none focus-visible:ring-0" />
          </label>
        </div>

        <div class="grid overflow-hidden rounded-md bg-muted/25 sm:grid-cols-2">
          <label class="flex min-h-11 items-center justify-between px-3 text-sm hover:bg-accent/35">
            内容可插入
            <Switch v-model="draft.insertable" />
          </label>
          <label class="flex min-h-11 items-center justify-between px-3 text-sm hover:bg-accent/35">
            允许模板
            <Switch v-model="draft.templatable" />
          </label>
          <label class="flex min-h-11 items-center justify-between px-3 text-sm hover:bg-accent/35">
            允许导入
            <Switch v-model="draft.importable" />
          </label>
          <label class="flex min-h-11 items-center justify-between px-3 text-sm hover:bg-accent/35">
            允许文件夹
            <Switch v-model="draft.allowFolder" />
          </label>
        </div>

        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">导入转换器或检测器</span>
          <Textarea
            v-model="draft.importConverter"
            class="min-h-20 resize-none rounded-none border-0 border-b bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
            placeholder="可留空"
          />
        </label>
        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">默认资源</span>
          <Textarea
            v-model="draft.defaultResource"
            class="min-h-28 resize-none rounded-none border-0 border-b bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
            placeholder="新建资源时使用"
          />
        </label>
      </div>

      <DialogFooter class="px-5 pb-5 pt-4">
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button @click="save">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
