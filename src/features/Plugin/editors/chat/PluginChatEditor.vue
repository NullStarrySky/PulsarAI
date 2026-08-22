<script setup lang="ts">
import { computed } from "vue";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { parsePluginChatContext, type PluginChatMessage } from "./plugin-chat";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const parsed = computed(() => {
  try { return { value: parsePluginChatContext(props.modelValue), error: "" }; }
  catch (error) { return { value: { message: [] as PluginChatMessage[] }, error: error instanceof Error ? error.message : String(error) }; }
});
function serialize(message: PluginChatMessage[]) { return JSON.stringify({ message: message.map(({ name, enabled, ...item }) => ({ ...item, ...(name?.trim() ? { name: name.trim() } : {}), ...(enabled === false ? { enabled } : {}) })) }, null, 2); }
function update(index: number, patch: Partial<PluginChatMessage>) { const message = structuredClone(parsed.value.value.message); message[index] = { ...message[index]!, ...patch }; emit("update:modelValue", serialize(message)); }
function add() { emit("update:modelValue", serialize([...parsed.value.value.message, { role: "system", content: "" }])); }
function remove(index: number) { emit("update:modelValue", serialize(parsed.value.value.message.filter((_, itemIndex) => itemIndex !== index))); }
function move(index: number, delta: number) { const target = index + delta; const message = structuredClone(parsed.value.value.message); if (target < 0 || target >= message.length) return; [message[index], message[target]] = [message[target]!, message[index]!]; emit("update:modelValue", serialize(message)); }
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between border-b bg-muted/10 px-5 py-4"><div><div class="text-sm font-semibold tracking-tight text-foreground/90">对话上下文</div><p class="mt-0.5 text-xs text-muted-foreground">按顺序编辑带角色消息，可命名或停用单条；停用的消息不会进入生成上下文。</p></div><Button size="sm" variant="outline" class="h-8 rounded-lg shadow-sm hover:bg-muted" @click="add"><Plus class="mr-1 size-3.5" />添加消息</Button></div>
    <div v-if="parsed.error" class="m-5 rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">{{ parsed.error }}；请切换到源码修复。</div>
    <ScrollArea v-else class="min-h-0 flex-1"><div class="space-y-4 p-5"><div v-for="(message, index) in parsed.value.message" :key="index" class="rounded-xl border border-border/60 bg-card shadow-sm transition-all duration-200" :class="message.enabled === false ? 'opacity-55 saturate-50' : 'hover:border-border/85'"><div class="flex items-center gap-2 border-b border-border/40 bg-muted/5 px-3.5 py-2.5"><Select :model-value="message.role" @update:model-value="update(index, { role: $event as never })"><SelectTrigger class="h-8 w-28 shrink-0 rounded-lg text-xs"><SelectValue /></SelectTrigger><SelectContent class="rounded-xl"><SelectItem value="system">system</SelectItem><SelectItem value="user">user</SelectItem><SelectItem value="assistant">assistant</SelectItem></SelectContent></Select><Input :value="message.name" placeholder="命名（可选）" class="h-8 min-w-0 flex-1 rounded-lg border-border/40 bg-background/60 text-xs" @input="update(index, { name: ($event.target as HTMLInputElement).value })" /><span v-if="message.enabled === false" class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">已停用</span><span v-else class="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#{{ index + 1 }}</span><Switch :model-value="message.enabled !== false" class="shrink-0 scale-75" @update:model-value="update(index, { enabled: $event })" /><div class="ml-auto flex shrink-0 items-center gap-0.5"><Button size="icon" variant="ghost" class="size-7 rounded-lg" :disabled="index === 0" @click="move(index, -1)"><ArrowUp class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7 rounded-lg" :disabled="index === parsed.value.message.length - 1" @click="move(index, 1)"><ArrowDown class="size-3.5" /></Button><Button size="icon" variant="ghost" class="size-7 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive" @click="remove(index)"><Trash2 class="size-3.5" /></Button></div></div><textarea :value="message.content" class="min-h-32 w-full resize-y rounded-b-xl border-t border-border/40 bg-muted/15 p-3.5 font-mono text-xs leading-5 outline-none transition-colors focus:bg-background" placeholder="输入消息内容..." @input="update(index, { content: ($event.target as HTMLTextAreaElement).value })" /></div><button v-if="!parsed.value.message.length" type="button" class="flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-xs text-muted-foreground transition-all duration-200 hover:border-primary/50 hover:bg-muted/10 hover:text-foreground" @click="add"><Plus class="mb-1.5 size-5 text-muted-foreground/80" /><span>添加第一条消息</span></button></div></ScrollArea>
  </div>
</template>
