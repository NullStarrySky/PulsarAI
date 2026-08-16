<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Plus,
  Ruler,
  Trash2,
} from "lucide-vue-next";
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
import type { PluginContainerDetailsQuery } from "@/features/Plugin/runtime/plugin-reference-resolver";
import {
  parsePluginContainerDefinitions,
  serializePluginContainerDefinitions,
  type PluginContainerDeclaration,
} from "@/features/Plugin/runtime/plugin-reference";

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
    selectionMode: "none",
    overrideStrategy: "override",
    selectedPaths: [],
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
  props.containerDetails.find((item) => item.definitionId === props.definitionId)?.pluginId ?? ""
);

const localContainers = computed(() =>
  parsed.value.containers.map((container, index) => ({
    container,
    index,
    isDeclaredHere: true,
  }))
);

const globalContainerQueries = computed(() =>
  props.containerDetails.filter((item) => item.scope === "global")
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

function normPath(path: string) {
  return path.replace(/^\//, "").trim().toLowerCase();
}

function isPathSelected(container: PluginContainerDeclaration, path: string) {
  const norm = normPath(path);
  return (container.selectedPaths ?? []).some((p) => {
    const np = normPath(p);
    return np === norm || norm.endsWith(`/${np}`) || np.endsWith(`/${norm}`);
  });
}

function toggleSelection(index: number, path: string) {
  const container = parsed.value.containers[index];
  if (!container) return;
  const mode = container.selectionMode ?? "none";
  if (mode === "none") return;

  const current = container.selectedPaths ?? [];
  const selected = isPathSelected(container, path);
  let next: string[];

  if (mode === "single") {
    next = selected ? [] : [path];
  } else {
    const targetNorm = normPath(path);
    if (selected) {
      next = current.filter((p) => normPath(p) !== targetNorm);
    } else {
      next = [...current, path];
    }
  }
  patch(index, { selectedPaths: next });
}

function isSelectedGlobally(containerName: string, path: string) {
  const globalQuery = globalContainerQueries.value.find((g) => g.name === containerName);
  if (!globalQuery) return false;
  const norm = normPath(path);
  return (globalQuery.selectedPaths ?? []).some((p) => {
    const np = normPath(p);
    return np === norm || norm.endsWith(`/${np}`) || np.endsWith(`/${norm}`);
  });
}

function jumpToGlobalContainer(containerName: string) {
  const key = `global:${containerName}`;
  expanded.value.add(key);
  const element = document.getElementById(`container-card-global-${containerName}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <header class="flex items-center justify-between border-b px-5 py-4 bg-muted/10">
      <div>
        <h2 class="text-sm font-semibold tracking-tight text-foreground/90">容器声明与选择器</h2>
        <p class="mt-0.5 text-xs text-muted-foreground">规范容器的选择性（单选/多选/不可选）与覆盖性，精准控制进入流程的资源。</p>
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
      <div class="space-y-6 p-5">
        <!-- 本地组 -->
        <section class="space-y-3">
          <div class="flex items-center justify-between border-b pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <span>本地组</span>
              <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-mono">{{ localContainers.length }}</Badge>
            </h3>
            <span class="text-[11px] text-muted-foreground">本插件定义的本地与全局容器</span>
          </div>

          <article
            v-for="{ container, index } in localContainers"
            :id="`container-card-${container.scope}-${container.id}`"
            :key="`${container.scope}:${container.id}:${index}`"
            class="rounded-xl border border-border/60 bg-card shadow-sm hover:border-border/85 transition-all duration-200"
          >
            <!-- Header Grid -->
            <div class="grid gap-3 p-4 md:grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_6.5rem_7.5rem_7.5rem_auto] items-end">
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
              <label class="space-y-1.5">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">选择性</span>
                <Select :model-value="container.selectionMode ?? 'none'" @update:model-value="patch(index, { selectionMode: $event as never })">
                  <SelectTrigger class="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent class="rounded-xl">
                    <SelectItem value="none">不可选</SelectItem>
                    <SelectItem value="single">单选</SelectItem>
                    <SelectItem value="multiple">多选</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label class="space-y-1.5">
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">覆盖性</span>
                <Select :model-value="container.overrideStrategy ?? 'override'" @update:model-value="patch(index, { overrideStrategy: $event as never })">
                  <SelectTrigger class="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent class="rounded-xl">
                    <SelectItem value="override">覆盖</SelectItem>
                    <SelectItem value="merge">合并</SelectItem>
                    <SelectItem value="intersection">交集</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <Button size="icon" variant="ghost" class="size-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg" title="删除容器" @click="remove(index)">
                <Trash2 class="size-4" />
              </Button>
            </div>

            <!-- Description & Suffixes -->
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

            <!-- Collapse Header Toggle -->
            <button
              type="button"
              class="flex w-full items-center gap-2 border-t border-border/40 px-4 py-2.5 text-left text-xs text-muted-foreground hover:bg-muted/40 transition-colors select-none"
              @click="toggle(`${container.scope}:${container.id}`)"
            >
              <ChevronDown class="size-3.5 transition-transform duration-200" :class="expanded.has(`${container.scope}:${container.id}`) && 'rotate-180'" />
              <span class="font-medium text-foreground/80">{{ details(container)?.contentCount ?? 0 }} 个注册资源</span>
              <span v-if="(container.selectedPaths?.length ?? 0) > 0" class="text-[10px] text-primary font-mono ml-2">
                已选中 {{ container.selectedPaths?.length }} 个
              </span>
              <div class="ml-auto flex gap-1">
                <Badge v-for="suffix in container.contentSuffixes" :key="suffix" variant="secondary" class="font-mono text-[9px] px-1.5 py-0 rounded">{{ suffix }}</Badge>
              </div>
            </button>

            <!-- Resource Items -->
            <div v-if="expanded.has(`${container.scope}:${container.id}`)" class="border-t border-border/40 px-3 py-2 bg-muted/10 divide-y divide-border/40">
              <div
                v-for="resource in details(container)?.contents ?? []"
                :key="resource.id"
                class="flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-all duration-150 hover:bg-muted/60"
                :class="isPathSelected(container, resource.path) ? 'bg-primary/10 font-semibold text-foreground' : 'text-foreground/85'"
              >
                <!-- Resource Details & Selection Click -->
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  @click="toggleSelection(index, resource.path)"
                >
                  <FileText class="size-3.5 text-muted-foreground shrink-0" />
                  <span class="truncate font-medium hover:underline" @click.stop="emit('openResource', resource)">{{ resource.path }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/40 shrink-0">{{ resource.type }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/30 shrink-0">{{ resource.pluginName }}</span>
                </button>

                <!-- Selection & Global Indicators -->
                <div class="flex items-center gap-2 shrink-0 select-none">
                  <!-- Local Selection Badge -->
                  <Badge
                    v-if="isPathSelected(container, resource.path)"
                    variant="default"
                    class="h-5 text-[10px] px-2 rounded-full flex items-center gap-1 cursor-pointer"
                    @click="toggleSelection(index, resource.path)"
                  >
                    <Check class="size-3" />
                    <span>已选</span>
                  </Badge>

                  <!-- Global Selection Indicator (Ruler) & Jump Button -->
                  <div
                    v-if="isSelectedGlobally(container.id, resource.path)"
                    class="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
                    title="已被全局容器选中"
                  >
                    <Ruler class="size-3" />
                    <span>全局选择</span>
                    <button
                      type="button"
                      class="hover:opacity-80 p-0.5 rounded transition-opacity"
                      title="跳转到全局容器"
                      @click.stop="jumpToGlobalContainer(container.id)"
                    >
                      <ExternalLink class="size-3" />
                    </button>
                  </div>
                </div>
              </div>
              <p v-if="!details(container)?.contents.length" class="px-2 py-3 text-xs text-muted-foreground text-center">尚无资源成员</p>
            </div>
          </article>

          <button
            v-if="!localContainers.length"
            type="button"
            class="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted/10 hover:text-foreground transition-all duration-200"
            @click="add"
          >
            <Plus class="mb-1 size-4 text-muted-foreground/80" />
            <span>添加第一个本地容器</span>
          </button>
        </section>

        <!-- 全局组 -->
        <section class="space-y-3">
          <div class="flex items-center justify-between border-b pb-2">
            <h3 class="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
              <span>全局组</span>
              <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-mono">{{ globalContainerQueries.length }}</Badge>
            </h3>
            <span class="text-[11px] text-muted-foreground">全局共享与跨插件作用域容器</span>
          </div>

          <article
            v-for="globalQuery in globalContainerQueries"
            :id="`container-card-global-${globalQuery.name}`"
            :key="`global-query:${globalQuery.id}`"
            class="rounded-xl border border-border/60 bg-card shadow-sm hover:border-border/85 transition-all duration-200"
          >
            <div class="flex items-center justify-between p-4">
              <div class="space-y-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-sm text-foreground/90">{{ globalQuery.title }}</span>
                  <Badge variant="secondary" class="font-mono text-[10px] px-1.5 py-0.5 rounded">{{ globalQuery.name }}</Badge>
                  <Badge variant="outline" class="text-[10px] px-1.5 py-0.5 rounded border-purple-500/40 text-purple-600 dark:text-purple-400">global</Badge>
                </div>
                <p v-if="globalQuery.description" class="text-xs text-muted-foreground">{{ globalQuery.description }}</p>
                <div class="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                  <span>来自插件: <strong class="text-foreground/80">{{ globalQuery.pluginName }}</strong></span>
                  <span>·</span>
                  <span>选择性: <span class="font-medium text-foreground/80">{{ globalQuery.selectionMode }}</span></span>
                  <span>·</span>
                  <span>覆盖性: <span class="font-medium text-foreground/80">{{ globalQuery.overrideStrategy }}</span></span>
                </div>
              </div>

              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all select-none"
                @click="toggle(`global:${globalQuery.name}`)"
              >
                <ChevronDown class="size-3.5 transition-transform duration-200" :class="expanded.has(`global:${globalQuery.name}`) && 'rotate-180'" />
                <span>{{ globalQuery.contentCount }} 个资源</span>
              </button>
            </div>

            <!-- Global Resource List -->
            <div v-if="expanded.has(`global:${globalQuery.name}`)" class="border-t border-border/40 px-3 py-2 bg-muted/10 divide-y divide-border/40">
              <div
                v-for="resource in globalQuery.contents"
                :key="resource.id"
                class="flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-xs text-foreground/85 transition-all duration-150 hover:bg-muted/60"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  @click="emit('openResource', resource)"
                >
                  <FileText class="size-3.5 text-muted-foreground shrink-0" />
                  <span class="truncate font-medium hover:underline">{{ resource.path }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border/40 shrink-0">{{ resource.type }}</span>
                  <span class="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/30 shrink-0">{{ resource.pluginName }}</span>
                </button>
              </div>
              <p v-if="!globalQuery.contents.length" class="px-2 py-3 text-xs text-muted-foreground text-center">尚无资源成员</p>
            </div>
          </article>

          <p v-if="!globalContainerQueries.length" class="px-2 py-4 text-xs text-muted-foreground text-center">暂无全局容器</p>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
