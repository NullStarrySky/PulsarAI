<script setup lang="ts">
import { computed, ref } from "vue";
import { ChevronDown, FileText, Plus, Trash2 } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PluginContainerDetailsQuery } from "../application/plugin-reference-resolver";
import {
  parsePluginContainerDefinitions,
  serializePluginContainerDefinitions,
  type PluginContainerDeclaration,
} from "../domain/plugin-reference";

const props = defineProps<{
  modelValue: string;
  definitionId: string;
  containerDetails: PluginContainerDetailsQuery[];
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "openResource": [resource: { pluginId: string; id: string; path: string }];
}>();

const expanded = ref(new Set<string>());
const parsed = computed(() => parsePluginContainerDefinitions(props.modelValue));

function save(containers: PluginContainerDeclaration[]) {
  emit("update:modelValue", serializePluginContainerDefinitions({ containers }));
}

function patch(index: number, value: Partial<PluginContainerDeclaration>) {
  const containers = structuredClone(parsed.value.containers);
  containers[index] = { ...containers[index]!, ...value };
  save(containers);
}

function add() {
  const containers = structuredClone(parsed.value.containers);
  const used = new Set(containers.map((item) => item.id));
  let suffix = 1;
  while (used.has(`container-${suffix}`)) suffix += 1;
  containers.push({
    id: `container-${suffix}`,
    title: "新容器",
    scope: "local",
    description: "",
    contentSuffixes: ["*"],
  });
  save(containers);
}

function remove(index: number) {
  save(parsed.value.containers.filter((_, itemIndex) => itemIndex !== index));
}

function details(container: PluginContainerDeclaration) {
  return props.containerDetails.find((item) =>
    item.pluginId === containerPluginId.value
    && item.name === container.id
    && item.scope === container.scope
  ) ?? null;
}

const containerPluginId = computed(() =>
  props.containerDetails.find((item) => item.definitionId === props.definitionId)?.pluginId ?? "",
);

function toggle(key: string) {
  const next = new Set(expanded.value);
  next.has(key) ? next.delete(key) : next.add(key);
  expanded.value = next;
}

function suffixText(container: PluginContainerDeclaration) {
  return container.contentSuffixes.join(", ");
}

function setSuffixes(index: number, value: string) {
  patch(index, {
    contentSuffixes: [...new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))],
  });
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <header class="flex items-center justify-between border-b px-5 py-4 bg-muted/10">
      <div>
        <h2 class="text-sm font-semibold tracking-tight text-foreground/90">容器声明</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">容器只注册资源；后缀限制用于防止把错误类型放进执行流程。</p>
      </div>
      <Button size="sm" variant="outline" class="h-8 rounded-lg shadow-sm hover:bg-muted" @click="add">
        <Plus class="mr-1 size-3.5" />
        添加容器
      </Button>
    </header>

    <div v-if="parsed.diagnostics.length" class="m-5 rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive animate-in fade-in">
      {{ parsed.diagnostics[0]?.path }}：{{ parsed.diagnostics[0]?.message }}
    </div>

    <ScrollArea v-else class="min-h-0 flex-1">
      <div class="space-y-4 p-5">
        <article
          v-for="(container, index) in parsed.containers"
          :key="`${container.scope}:${container.id}:${index}`"
          class="rounded-xl border border-border/60 bg-card shadow-sm hover:border-border/85 transition-all duration-200"
        >
          <div class="grid gap-3 p-4 md:grid-cols-[minmax(9rem,0.8fr)_minmax(10rem,1fr)_8rem_auto] items-end">
            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">ID</span>
              <Input :model-value="container.id" class="h-8 font-mono text-xs rounded-lg" @change="patch(index, { id: ($event.target as HTMLInputElement).value.trim() })" />
            </label>
            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">标题</span>
              <Input :model-value="container.title" class="h-8 text-xs rounded-lg" @change="patch(index, { title: ($event.target as HTMLInputElement).value.trim() })" />
            </label>
            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">作用域</span>
              <Select :model-value="container.scope" @update:model-value="patch(index, { scope: $event as never })">
                <SelectTrigger class="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent class="rounded-xl">
                  <SelectItem value="local">local</SelectItem>
                  <SelectItem value="global">global</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button size="icon" variant="ghost" class="size-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg" title="删除容器" @click="remove(index)">
              <Trash2 class="size-4" />
            </Button>
          </div>

          <div class="grid gap-3 border-t border-border/40 px-4 py-3 md:grid-cols-[1fr_minmax(12rem,0.7fr)] bg-muted/5">
            <label class="space-y-1">
              <span class="text-[10px] text-muted-foreground">用途说明</span>
              <Input
                :model-value="container.description"
                class="h-8 text-xs rounded-lg"
                placeholder="单行用途说明..."
                @change="patch(index, { description: ($event.target as HTMLInputElement).value.replace(/\s+/g, ' ').trim() })"
              />
            </label>
            <label class="space-y-1">
              <span class="text-[10px] text-muted-foreground">允许后缀</span>
              <Input
                :model-value="suffixText(container)"
                class="h-8 font-mono text-xs rounded-lg"
                placeholder="md, js, media 或 *"
                @change="setSuffixes(index, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>

          <button
            type="button"
            class="flex w-full items-center gap-2 border-t border-border/40 px-4 py-2.5 text-left text-xs text-muted-foreground hover:bg-muted/40 transition-colors select-none"
            @click="toggle(`${container.scope}:${container.id}`)"
          >
            <ChevronDown class="size-3.5 transition-transform duration-200" :class="expanded.has(`${container.scope}:${container.id}`) && 'rotate-180'" />
            <span class="font-medium text-foreground/80">{{ details(container)?.contentCount ?? 0 }} 个注册资源</span>
            <div class="ml-auto flex gap-1">
              <Badge v-for="suffix in container.contentSuffixes" :key="suffix" variant="secondary" class="font-mono text-[9px] px-1.5 py-0 rounded">{{ suffix }}</Badge>
            </div>
          </button>

          <div v-if="expanded.has(`${container.scope}:${container.id}`)" class="border-t border-border/40 px-3 py-2 bg-muted/10 divide-y divide-border/40">
            <button
              v-for="resource in details(container)?.contents ?? []"
              :key="resource.id"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-foreground/85 hover:bg-muted/80 hover:text-foreground transition-all duration-150"
              @click="emit('openResource', resource)"
            >
              <FileText class="size-3.5 text-muted-foreground shrink-0" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ resource.path }}</span>
              <span class="font-mono text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/40">{{ resource.pluginName }}</span>
            </button>
            <p v-if="!details(container)?.contents.length" class="px-2 py-3 text-xs text-muted-foreground text-center">尚无资源成员</p>
          </div>
        </article>

        <button
          v-if="!parsed.containers.length"
          type="button"
          class="flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted/10 hover:text-foreground transition-all duration-200"
          @click="add"
        >
          <Plus class="mb-1.5 size-5 text-muted-foreground/80" />
          <span>添加第一个容器</span>
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
