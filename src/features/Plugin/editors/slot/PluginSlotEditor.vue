<script setup lang="ts">
import { computed } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPluginSlotDefinitions, parsePluginSlots, type PluginSlot } from "./plugin-slot";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const slots = computed(() => parsePluginSlots(props.modelValue));
const emptySlot = (): PluginSlot => ({
  id: "",
  title: "新容器",
  scope: "local",
  description: "",
  contentSuffixes: [],
  selectionMode: "none",
});
function write(next: PluginSlot[]) {
  emit("update:modelValue", JSON.stringify(createPluginSlotDefinitions(next), null, 2));
}
function update(index: number, patch: Partial<PluginSlot>) {
  const next = structuredClone(slots.value);
  next[index] = { ...next[index]!, ...patch };
  write(next);
}
function remove(index: number) { write(slots.value.filter((_, itemIndex) => itemIndex !== index)); }
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between gap-4 border-b bg-muted/10 px-5 py-4">
      <div>
        <div class="text-sm font-semibold">容器定义</div>
        <p class="mt-0.5 text-xs text-muted-foreground">定义可插入资源的容器、可接受的文件类型与选择方式。</p>
      </div>
      <Button size="sm" variant="outline" class="h-8 rounded-lg" @click="write([...slots, emptySlot()])"><Plus class="mr-1 size-3.5" />添加容器</Button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-5">
      <div v-if="slots.length" class="space-y-3">
        <section v-for="(slot, index) in slots" :key="`${slot.id}:${index}`" class="rounded-xl border bg-card p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between"><span class="text-sm font-medium">容器 {{ index + 1 }}</span><Button size="icon" variant="ghost" class="size-7 text-destructive hover:bg-destructive/10" title="删除容器" @click="remove(index)"><Trash2 class="size-3.5" /></Button></div>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="grid gap-1.5 text-xs font-medium">ID<Input :model-value="slot.id" placeholder="例如 REGEX" @update:model-value="update(index, { id: String($event ?? '') })" /></label>
            <label class="grid gap-1.5 text-xs font-medium">标题<Input :model-value="slot.title" placeholder="显示名称" @update:model-value="update(index, { title: String($event ?? '') })" /></label>
            <label class="grid gap-1.5 text-xs font-medium">作用域<Select :model-value="slot.scope" @update:model-value="update(index, { scope: $event as PluginSlot['scope'] })"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="local">当前包</SelectItem><SelectItem value="global">全局</SelectItem></SelectContent></Select></label>
            <label class="grid gap-1.5 text-xs font-medium">选择方式<Select :model-value="slot.selectionMode" @update:model-value="update(index, { selectionMode: $event as PluginSlot['selectionMode'] })"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">无选择</SelectItem><SelectItem value="single">单选</SelectItem><SelectItem value="multiple">多选</SelectItem></SelectContent></Select></label>
            <label class="grid gap-1.5 text-xs font-medium md:col-span-2">说明<Input :model-value="slot.description" placeholder="这个容器会在何处使用？" @update:model-value="update(index, { description: String($event ?? '') })" /></label>
            <label class="grid gap-1.5 text-xs font-medium md:col-span-2">允许的后缀（每行一个）<Textarea class="min-h-20 font-mono text-xs" :model-value="slot.contentSuffixes.join('\n')" placeholder=".md\n.regex.json" @update:model-value="update(index, { contentSuffixes: String($event ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean) })" /></label>
            <label v-if="slot.selectionMode !== 'none'" class="grid gap-1.5 text-xs font-medium md:col-span-2">选中资源（每行一个相对路径或 `@pluginId/path`）<Textarea class="min-h-20 font-mono text-xs" :model-value="(slot.selectedPaths ?? []).join('\n')" placeholder="context/build.js" @update:model-value="update(index, { selectedPaths: String($event ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean) })" /></label>
          </div>
        </section>
      </div>
      <button v-else type="button" class="flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground" @click="write([emptySlot()])"><Plus class="mb-2 size-5" />添加第一个容器</button>
    </div>
  </div>
</template>
