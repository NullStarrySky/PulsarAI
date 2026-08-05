<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Boxes,
  ChevronRight,
  FileText,
  Package,
  Plus,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parsePluginContainerDefinitions,
  serializePluginContainerDefinitions,
  type PluginContainerDeclaration,
  type PluginContainerScope,
} from "@/features/Resources/Plugin/domain/plugin-reference";
import type {
  PluginContainerDetailsQuery,
  PluginContainerResourceQuery,
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    readonly?: boolean;
    containerDetails?: PluginContainerDetailsQuery[];
    definitionId?: string;
  }>(),
  {
    modelValue: '{\n  "containers": []\n}',
    readonly: false,
    containerDetails: () => [],
    definitionId: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "open-resource": [resource: PluginContainerResourceQuery];
}>();

const expandedContainerIds = ref<string[]>([]);
const definitions = computed(() =>
  parsePluginContainerDefinitions(props.modelValue),
);

const duplicateKeys = computed(() => {
  const counts = new Map<string, number>();
  for (const container of definitions.value.containers) {
    const key = `${container.scope}:${container.name.trim()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  );
});

function updateDefinitions(
  mutate: (containers: PluginContainerDeclaration[]) => void,
) {
  if (props.readonly || definitions.value.diagnostics.length) return;
  const containers = structuredClone(definitions.value.containers);
  mutate(containers);
  emit(
    "update:modelValue",
    serializePluginContainerDefinitions({ containers }),
  );
}

function addContainer() {
  updateDefinitions((containers) => {
    const names = new Set(containers.map((item) => item.name));
    let index = containers.length + 1;
    while (names.has(`新容器${index}`)) index += 1;
    containers.push({
      name: `新容器${index}`,
      scope: "local",
      description: "",
    });
  });
}

function updateContainer(
  index: number,
  patch: Partial<
    Pick<PluginContainerDeclaration, "name" | "scope" | "description">
  >,
) {
  updateDefinitions((containers) => {
    const container = containers[index];
    if (container) Object.assign(container, patch);
  });
}

function removeContainer(index: number) {
  updateDefinitions((containers) => {
    containers.splice(index, 1);
  });
}

function containerIssue(container: PluginContainerDeclaration) {
  if (!container.name.trim()) return "容器名称不能为空";
  if (duplicateKeys.value.has(`${container.scope}:${container.name.trim()}`)) {
    return "同一作用域中的容器名称重复";
  }
  return "";
}

function detailsFor(container: PluginContainerDeclaration) {
  return props.containerDetails.find(
    (item) =>
      item.name === container.name
      && item.scope === container.scope
      && (!props.definitionId || item.definitionId === props.definitionId),
  );
}

function detailKey(
  container: PluginContainerDeclaration,
  containerIndex: number,
) {
  return detailsFor(container)?.id
    ?? `${container.scope}:${container.name}:${containerIndex}`;
}

function isDetailsOpen(
  container: PluginContainerDeclaration,
  containerIndex: number,
) {
  return expandedContainerIds.value.includes(detailKey(container, containerIndex));
}

function toggleDetails(
  container: PluginContainerDeclaration,
  containerIndex: number,
) {
  const key = detailKey(container, containerIndex);
  expandedContainerIds.value = expandedContainerIds.value.includes(key)
    ? expandedContainerIds.value.filter((item) => item !== key)
    : [...expandedContainerIds.value, key];
}
</script>

<template>
  <ScrollArea class="h-full bg-background">
    <div class="mx-auto w-full max-w-[1040px] px-4 pb-12 pt-4 mobile:px-3">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <Boxes class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold">容器定义</h2>
            <span class="text-xs text-muted-foreground">
              {{ definitions.containers.length }} 个
            </span>
          </div>
        </div>
        <Button
          v-if="!readonly"
          size="sm"
          variant="outline"
          class="h-8 shrink-0"
          @click="addContainer"
        >
          <Plus class="mr-1.5 size-3.5" />
          添加容器
        </Button>
      </div>

      <Alert v-if="definitions.diagnostics.length" class="mb-3" variant="destructive">
        <AlertTitle>containers.json 存在问题</AlertTitle>
        <AlertDescription>
          <ul class="list-disc pl-4">
            <li v-for="item in definitions.diagnostics" :key="`${item.path}:${item.message}`">
              {{ item.path }}：{{ item.message }}
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <div v-if="definitions.containers.length" class="space-y-2">
        <section
          v-for="(container, containerIndex) in definitions.containers"
          :key="containerIndex"
          class="rounded-lg border bg-card/35"
        >
          <div class="grid grid-cols-[minmax(8rem,1fr)_8rem_minmax(12rem,1.8fr)_auto_auto] items-end gap-2 p-3 mobile:grid-cols-[minmax(0,1fr)_auto]">
            <label class="min-w-0">
              <span class="mb-1 block text-[11px] text-muted-foreground">名称</span>
              <Input
                :model-value="container.name"
                :disabled="readonly"
                class="h-8"
                placeholder="容器名称"
                @update:model-value="updateContainer(containerIndex, { name: String($event) })"
              />
            </label>
            <label class="mobile:col-start-1">
              <span class="mb-1 block text-[11px] text-muted-foreground">作用域</span>
              <Select
                :model-value="container.scope"
                :disabled="readonly"
                @update:model-value="
                  updateContainer(containerIndex, {
                    scope: $event as PluginContainerScope,
                  })
                "
              >
                <SelectTrigger class="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">本地</SelectItem>
                  <SelectItem value="global">全局</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label class="min-w-0 mobile:col-span-2">
              <span class="mb-1 block text-[11px] text-muted-foreground">
                简短说明
                <span class="font-normal">（可选）</span>
              </span>
              <Input
                :model-value="container.description ?? ''"
                :disabled="readonly"
                class="h-8 text-xs"
                placeholder="用一句话说明这个容器提供什么"
                @update:model-value="
                  updateContainer(containerIndex, {
                    description: String($event),
                  })
                "
              />
            </label>
            <Button
              size="sm"
              variant="ghost"
              class="h-8 px-2 text-xs mobile:col-start-1 mobile:justify-start"
              :aria-expanded="isDetailsOpen(container, containerIndex)"
              @click="toggleDetails(container, containerIndex)"
            >
              <ChevronRight
                class="mr-1 size-3.5 transition-transform"
                :class="isDetailsOpen(container, containerIndex) && 'rotate-90'"
              />
              详情
              <span class="ml-1 text-muted-foreground">
                {{ detailsFor(container)?.usedByCount ?? 0 }} 使用 ·
                {{ detailsFor(container)?.contentCount ?? 0 }} 内容
              </span>
            </Button>
            <Button
              v-if="!readonly"
              size="icon"
              variant="ghost"
              class="size-8 mobile:col-start-2 mobile:row-start-2"
              title="删除容器"
              @click="removeContainer(containerIndex)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>

          <p
            v-if="containerIssue(container)"
            class="border-t px-4 py-2 text-xs text-destructive mobile:px-3"
          >
            {{ containerIssue(container) }}
          </p>

          <div
            v-if="isDetailsOpen(container, containerIndex)"
            class="grid grid-cols-2 gap-3 border-t bg-muted/10 p-3 mobile:grid-cols-1"
          >
            <section class="min-w-0 rounded-md border bg-background">
              <div class="flex h-8 items-center gap-1.5 border-b px-2.5">
                <FileText class="size-3.5 text-muted-foreground" />
                <h3 class="text-xs font-medium">使用此容器的文档</h3>
                <span class="text-[11px] text-muted-foreground">
                  {{ detailsFor(container)?.usedByCount ?? 0 }}
                </span>
              </div>
              <div v-if="detailsFor(container)?.usedBy.length" class="p-1">
                <button
                  v-for="resource in detailsFor(container)?.usedBy"
                  :key="`${resource.pluginId}:${resource.id}`"
                  type="button"
                  class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  @click="emit('open-resource', resource)"
                >
                  <span class="truncate text-xs font-medium">{{ resource.name }}</span>
                  <span class="text-[10px] text-muted-foreground">{{ resource.type }}</span>
                  <span class="col-span-2 truncate font-mono text-[10px] text-muted-foreground">
                    {{ resource.pluginName }} · {{ resource.path }}
                  </span>
                </button>
              </div>
              <p v-else class="px-3 py-4 text-center text-xs text-muted-foreground">
                暂无文档直接引用此容器。
              </p>
            </section>

            <section class="min-w-0 rounded-md border bg-background">
              <div class="flex h-8 items-center gap-1.5 border-b px-2.5">
                <Package class="size-3.5 text-muted-foreground" />
                <h3 class="text-xs font-medium">容器中的现有内容</h3>
                <span class="text-[11px] text-muted-foreground">
                  {{ detailsFor(container)?.contentCount ?? 0 }}
                </span>
              </div>
              <div v-if="detailsFor(container)?.contents.length" class="p-1">
                <button
                  v-for="resource in detailsFor(container)?.contents"
                  :key="`${resource.pluginId}:${resource.id}:${resource.alias}`"
                  type="button"
                  class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  @click="emit('open-resource', resource)"
                >
                  <span class="truncate text-xs font-medium">
                    {{ resource.name }}
                    <span class="font-normal text-muted-foreground">· {{ resource.alias }}</span>
                  </span>
                  <span class="font-mono text-[10px] text-muted-foreground">
                    P{{ resource.priority }}
                  </span>
                  <span class="col-span-2 truncate font-mono text-[10px] text-muted-foreground">
                    {{ resource.pluginName }} · {{ resource.path }}
                  </span>
                  <span
                    v-if="resource.condition"
                    class="col-span-2 truncate font-mono text-[10px] text-muted-foreground"
                    :title="JSON.stringify(resource.condition)"
                  >
                    条件：{{ resource.condition.reference }}{{ 'equals' in resource.condition ? ` = ${JSON.stringify(resource.condition.equals)}` : '' }}
                  </span>
                </button>
              </div>
              <p v-else class="px-3 py-4 text-center text-xs text-muted-foreground">
                此容器目前没有内容。
              </p>
            </section>

          </div>
        </section>
      </div>

      <div
        v-else
        class="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center"
      >
        <Boxes class="mb-3 size-6 text-muted-foreground" />
        <p class="text-sm font-medium">尚未声明容器</p>
        <p class="mt-1 text-xs text-muted-foreground">
          添加后，在资源的元数据中选择此容器即可加入；文件正文不会混入成员声明。
        </p>
        <Button
          v-if="!readonly"
          size="sm"
          variant="outline"
          class="mt-4 h-8"
          @click="addContainer"
        >
          <Plus class="mr-1.5 size-3.5" />
          添加容器
        </Button>
      </div>

      <p class="mt-5 text-[11px] leading-5 text-muted-foreground">
        本地容器只对当前插件可见；全局容器对当前启用的插件集合可见，不再按文件夹划分范围。
        最终上下文深度由资源自身的放置元数据控制，不属于普通容器声明。
      </p>
    </div>
  </ScrollArea>
</template>
