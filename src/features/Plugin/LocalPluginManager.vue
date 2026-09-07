<script setup lang="ts">
import { Pin, Plus, Upload } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { applyStImportPlan } from "@/features/Migrations/SillyTavern/import/st-import-apply";
import { buildStImportPlan, readStResourceFile } from "@/features/Migrations/SillyTavern/import/st-import-plan";
import { initializeWorlds, useWorld } from "./tree/world-store";
import { useLocalPluginStore } from "./local-plugin-store";
import { host } from "@/host";

const props = defineProps<{ localPluginId: string; buttonClass?: string }>();
const emit = defineEmits<{ select: [localPluginId: string]; "open-change": [open: boolean] }>();
const store = useLocalPluginStore(); const open = ref(false); const search = ref(""); const renaming = ref(false); const nameDraft = ref("");
const selected = computed(() => store.localPlugins.find(item => item.id === props.localPluginId) ?? null);
const visible = computed(() => { const q = search.value.trim().toLowerCase(); return store.localPlugins.filter(item => !q || item.name.toLowerCase().includes(q) || item.tags?.some(tag => tag.toLowerCase().includes(q))); });
const pinned = computed(() => visible.value.filter(item => store.preferences[item.id]?.pinned));
const others = computed(() => visible.value.filter(item => !store.preferences[item.id]?.pinned));
watch(open, value => { emit("open-change", value); if (value) void store.refresh(); });
async function create() { const item = await store.create(); open.value = false; emit("select", item.id); }
async function togglePin(id = props.localPluginId) { await store.updatePreferences(id, { pinned: !store.preferences[id]?.pinned }); }
function rename() { if (!selected.value) return; nameDraft.value = selected.value.name; renaming.value = true; }
async function confirmRename() { const item = selected.value; const name = nameDraft.value.trim(); renaming.value = false; if (!item || !name || name === item.name) return; await initializeWorlds(item.id); const world = useWorld({ localPluginId: item.id, applyReplay: false }); await world.updateFile("/self/definition.package.json", { content: { ...item, name } }); await store.refresh(); }
async function removeSelected() { const item = selected.value; if (!item || !window.confirm(`删除本地 Plugin “${item.name}”及其所有会话？此操作不可恢复。`)) return; await store.removeLocalPlugin(item.id); const next = store.localPlugins[0] ?? await store.create(); emit("select", next.id); }
async function importCharacter() { try { const path = await host.dialog.open({ title: "导入 SillyTavern 角色卡", multiple: false, directory: false, properties: ["openFile"], filters: [{ name: "SillyTavern 角色卡", extensions: ["png", "json"] }] }); if (typeof path !== "string") return; const file = await readStResourceFile(path); const plan = buildStImportPlan(file.fileName, file); if (plan.kind !== "character" || !plan.character) throw new Error("所选文件不是 SillyTavern 角色卡。"); const item = await store.create({ name: plan.character.name, nickname: file.fileName.replace(/\.[^.]+$/, ""), description: plan.character.description || undefined }); await initializeWorlds(item.id); await applyStImportPlan(useWorld({ localPluginId: item.id, applyReplay: false }), plan, "/self"); await store.refresh(); open.value = false; emit("select", item.id); toast.success(`已导入“${item.name}”。`); } catch (error) { toast.error(error instanceof Error ? error.message : "角色卡导入失败"); } }
defineExpose({ rename, removeSelected, togglePin });
</script>
<template>
  <div class="relative flex min-w-0 items-center">
    <Input v-if="renaming" v-model="nameDraft" autofocus class="h-8 w-40" @keydown.enter.prevent="confirmRename" @blur="confirmRename" />
    <Popover v-else v-model:open="open"><PopoverTrigger as-child><button type="button" class="flex h-9 max-w-44 items-center gap-2 rounded-lg px-2 text-left" :class="buttonClass"><span class="grid size-7 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{{ selected?.name.slice(0, 1) ?? 'P' }}</span><span class="truncate text-sm font-medium">{{ selected?.name ?? '选择角色' }}</span></button></PopoverTrigger><PopoverContent align="start" class="w-80 p-0"><div class="flex gap-2 border-b p-2"><Input v-model="search" placeholder="搜索角色…" class="h-8" /><Button size="sm" @click="create"><Plus class="size-4" />新建</Button><Button size="sm" variant="outline" @click="importCharacter"><Upload class="size-4" />导入</Button></div><ScrollArea class="h-80"><template v-for="group in [pinned, others]" :key="group === pinned ? 'pinned' : 'others'"><button v-for="item in group" :key="item.id" type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted" :class="item.id === localPluginId && 'bg-primary/10'" @click="open = false; emit('select', item.id)"><span class="grid size-8 place-items-center rounded-full bg-muted font-semibold">{{ item.name.slice(0, 1) }}</span><span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ item.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ item.description || item.tags?.join(' · ') || '本地 Plugin' }}</span></span><Button size="icon-sm" variant="ghost" @click.stop="togglePin(item.id)"><Pin class="size-3.5" /></Button></button></template><p v-if="!visible.length" class="p-8 text-center text-sm text-muted-foreground">没有匹配的角色</p></ScrollArea></PopoverContent></Popover>
  </div>
</template>
