<script setup lang="ts">
import { computed } from "vue";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  HelpCircle,
  Layers,
  Workflow,
  XCircle,
} from "lucide-vue-next";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { executeSandboxCode } from "@/features/Sandbox/domain/sandbox";
import { createPluginConditionEnvironment } from "@/features/Resources/Plugin/application/plugin-condition-environment";
import type { PluginReferenceResolver } from "@/features/Resources/Plugin/application/plugin-reference-resolver";

const props = defineProps<{
  pluginId: string;
  fileId: string;
  modelValue: string;
  resolver: PluginReferenceResolver | null;
}>();

const emit = defineEmits<{
  "open-resource": [
    resource: { id: string; pluginId: string; path: string },
  ];
}>();

// Extract container references from text
const containerRefs = computed(() => {
  if (!props.modelValue) return [];
  const refs: string[] = [];

  // Matches container:local/name or container:global/name
  const regex1 = /container:(local|global)\/([a-zA-Z0-9_\-\/]+)/g;
  let match;
  while ((match = regex1.exec(props.modelValue)) !== null) {
    refs.push(`container:${match[1]}/${match[2]}`);
  }

  // Matches imports.container("local", "name")
  const regex2 = /imports\.container\(['"](local|global)['"]\s*,\s*['"]([a-zA-Z0-9_\-\/]+)['"]\)/g;
  while ((match = regex2.exec(props.modelValue)) !== null) {
    refs.push(`container:${match[1]}/${match[2]}`);
  }

  // Matches imports.containers("local", "*")
  const regex3 = /imports\.containers\(['"](local|global)['"]\s*,\s*['"]([a-zA-Z0-9_\-\/\*]+)['"]\)/g;
  while ((match = regex3.exec(props.modelValue)) !== null) {
    // If it's a pattern, resolve matching containers from resolver
    if (props.resolver) {
      const scope = match[1] as "local" | "global";
      const pattern = match[2]!;
      const containers = props.resolver.listContainers().filter(c => {
        if (c.scope !== scope) return false;
        if (pattern === "*") return true;
        return c.name.includes(pattern.replace("*", ""));
      });
      for (const c of containers) {
        refs.push(c.id);
      }
    }
  }

  return [...new Set(refs)];
});

// Resolve container details
const resolvedContainers = computed(() => {
  if (!props.resolver) return [];
  return containerRefs.value.flatMap((id) => {
    const details = props.resolver?.getContainer(id);
    return details ? [details] : [];
  });
});

// Evaluate insertion conditions
function getConditionStatus(fileId: string, condition?: string) {
  if (!condition?.trim()) return { enabled: true, error: "" };
  if (!props.resolver) return { enabled: true, error: "" };
  try {
    const record = props.resolver.resourceById(fileId);
    if (!record) return { enabled: true, error: "" };

    const enabled = Boolean(executeSandboxCode(condition, [
      props.resolver.environment,
      createPluginConditionEnvironment(props.resolver.environment.chat ?? props.resolver.environment.CHAT),
      props.resolver.importsForResource(fileId) as any,
    ]));
    return { enabled, error: "" };
  } catch (err) {
    return { enabled: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Truncate long strings helper
function truncate(str: string, len = 40) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/40">
    <div class="flex items-center justify-between border-b px-5 py-3.5 bg-muted/10">
      <div>
        <div class="text-sm font-semibold tracking-tight text-foreground/90 flex items-center gap-2">
          <Workflow class="size-4 text-primary animate-pulse" />
          <span>解析拓扑图</span>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">分析当前资源文件中嵌入的宏、引用容器，及其包含 of 资源文件的动态条件求值状态。</p>
      </div>
    </div>

    <ScrollArea class="min-h-0 flex-1" orientation="both">
      <div class="flex gap-8 p-6 min-h-full items-start w-max">

        <!-- Column 1: Source File -->
        <div class="w-64 shrink-0 flex flex-col gap-3">
          <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">当前文件</div>
          <div class="rounded-xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md transition-all duration-300">
            <div class="flex items-center gap-2 mb-3">
              <div class="p-1.5 rounded-lg bg-primary/10 text-primary">
                <FileText class="size-4" />
              </div>
              <span class="text-xs font-semibold truncate">{{ resolver?.resourceById(fileId)?.name ?? "未知文件" }}</span>
            </div>
            <div class="text-[10px] text-muted-foreground space-y-1.5 font-mono">
              <div class="flex justify-between border-b border-border/30 pb-1">
                <span>路径</span>
                <span class="text-foreground max-w-[140px] truncate" :title="resolver?.resourceById(fileId)?.path">{{ resolver?.resourceById(fileId)?.path }}</span>
              </div>
              <div class="flex justify-between border-b border-border/30 pb-1">
                <span>宏数量</span>
                <span class="text-foreground font-semibold">{{ containerRefs.length }}</span>
              </div>
            </div>
          </div>

          <!-- Macros list inside file -->
          <div v-if="containerRefs.length" class="flex flex-col gap-2 mt-2">
            <div class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">解析出的宏/引用</div>
            <div
              v-for="refName in containerRefs"
              :key="refName"
              class="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border/40 bg-muted/20 text-xs font-mono text-muted-foreground group hover:border-primary/30 transition-all"
            >
              <span class="truncate max-w-[180px]" :title="refName">{{ refName }}</span>
              <ArrowRight class="size-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </div>

        <!-- Column 2: Resolved Containers -->
        <div class="w-72 shrink-0 flex flex-col gap-3">
          <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">引用容器</div>

          <div v-if="!resolvedContainers.length" class="h-32 rounded-xl border border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground/60 p-4 text-center">
            <Layers class="size-6 text-muted-foreground/30 mb-2" />
            没有检测到任何容器宏或导入
          </div>

          <div
            v-for="container in resolvedContainers"
            :key="container.id"
            class="rounded-xl border border-border/60 bg-card p-4 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-3"
          >
            <div class="flex items-center justify-between border-b border-border/30 pb-2">
              <span class="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers class="size-3.5 text-primary" />
                {{ container.name }}
              </span>
              <span
                class="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                :class="container.scope === 'local' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'"
              >
                {{ container.scope === 'local' ? '本地' : '全局' }}
              </span>
            </div>

            <p v-if="container.description" class="text-[10px] text-muted-foreground leading-normal">{{ container.description }}</p>

            <div class="text-[10px] text-muted-foreground space-y-1 bg-muted/20 p-2 rounded-lg font-mono">
              <div class="flex justify-between">
                <span>包含资源数</span>
                <span class="text-foreground font-semibold">{{ container.contents.length }}</span>
              </div>
              <div class="flex justify-between">
                <span>后缀匹配</span>
                <span class="text-foreground truncate max-w-[120px]" :title="container.contentSuffixes.join(', ')">{{ container.contentSuffixes.join(', ') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Column 3: Compiled Resources -->
        <div class="w-96 shrink-0 flex flex-col gap-3">
          <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">包含资源列表 (求值)</div>

          <div v-if="!resolvedContainers.length" class="h-32 rounded-xl border border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground/60 p-4 text-center">
            等待上级容器解析...
          </div>

          <div v-else class="flex flex-col gap-3">
            <template v-for="container in resolvedContainers" :key="container.id">
              <div
                v-for="item in container.contents"
                :key="item.id"
                class="rounded-xl border border-border/60 bg-card p-3 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-2 relative group"
                :class="!getConditionStatus(item.id, item.condition).enabled && 'opacity-65'"
              >
                <div class="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    class="text-xs font-semibold text-left truncate text-foreground hover:text-primary hover:underline"
                    @click="emit('open-resource', { id: item.id, pluginId: item.pluginId ?? pluginId, path: item.path })"
                  >
                    {{ item.name }}
                  </button>
                  <span class="text-[9px] font-mono text-muted-foreground/60 bg-muted/40 px-1.5 py-0.5 rounded shrink-0">
                    Order: {{ item.order }}
                  </span>
                </div>

                <div class="text-[10px] text-muted-foreground font-mono truncate">
                  路径: <span class="text-foreground/80">{{ item.path }}</span>
                </div>

                <!-- Condition and Sandboxed Evaluation status -->
                <div
                  v-if="item.condition"
                  class="flex items-center justify-between border-t border-border/30 pt-2 text-[10px] gap-2"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="font-mono text-muted-foreground cursor-help truncate max-w-[200px] flex items-center gap-1">
                          <HelpCircle class="size-3 shrink-0" />
                          条件: {{ truncate(item.condition, 24) }}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent class="max-w-xs p-2.5 font-mono text-xs rounded-xl shadow-lg border bg-popover text-popover-foreground">
                        {{ item.condition }}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <div class="flex items-center gap-1 shrink-0 font-semibold">
                    <template v-if="getConditionStatus(item.id, item.condition).error">
                      <span class="text-destructive text-[9px]">求值异常</span>
                      <XCircle class="size-3.5 text-destructive" />
                    </template>
                    <template v-else-if="getConditionStatus(item.id, item.condition).enabled">
                      <span class="text-emerald-500 text-[9px]">通过</span>
                      <CheckCircle2 class="size-3.5 text-emerald-500" />
                    </template>
                    <template v-else>
                      <span class="text-destructive text-[9px]">未通过</span>
                      <XCircle class="size-3.5 text-destructive" />
                    </template>
                  </div>
                </div>

                <div v-else class="flex items-center justify-between border-t border-border/30 pt-2 text-[10px] text-muted-foreground/50 italic">
                  <span>无条件限制 (默认通过)</span>
                  <CheckCircle2 class="size-3.5 text-emerald-500 shrink-0" />
                </div>
              </div>
            </template>
          </div>
        </div>

      </div>
    </ScrollArea>
  </div>
</template>
