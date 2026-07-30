<script setup lang="ts">
import { computed } from "vue";
import { Boxes, Plus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    readonly?: boolean;
  }>(),
  {
    modelValue: "",
    readonly: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

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
  if (props.readonly) return;
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
      scope: "plugin",
      description: "",
      imports: [],
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

function addImport(containerIndex: number) {
  updateDefinitions((containers) => {
    containers[containerIndex]?.imports.push({
      alias: "container",
      target: "container:plugin/",
    });
  });
}

function updateImport(
  containerIndex: number,
  importIndex: number,
  patch: Partial<{ alias: string; target: string }>,
) {
  updateDefinitions((containers) => {
    const item = containers[containerIndex]?.imports[importIndex];
    if (item) Object.assign(item, patch);
  });
}

function removeImport(containerIndex: number, importIndex: number) {
  updateDefinitions((containers) => {
    containers[containerIndex]?.imports.splice(importIndex, 1);
  });
}

function containerIssue(container: PluginContainerDeclaration) {
  if (!container.name.trim()) return "容器名称不能为空";
  if (duplicateKeys.value.has(`${container.scope}:${container.name.trim()}`)) {
    return "同一作用域中的容器名称重复";
  }
  const aliases = container.imports.map((item) => item.alias.trim());
  if (aliases.some((alias) => !alias)) return "引用别名不能为空";
  if (new Set(aliases).size !== aliases.length) return "引用别名重复";
  if (container.imports.some((item) => !item.target.trim())) {
    return "引用目标不能为空";
  }
  return "";
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-background">
    <div class="mx-auto w-full max-w-[920px] px-6 pb-20 pt-7 mobile:px-3 mobile:pb-12 mobile:pt-4">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <Boxes class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold">容器定义</h2>
          </div>
          <p class="mt-1.5 max-w-2xl text-xs leading-5 text-muted-foreground">
            在这里统一声明当前插件的容器与命名空间引用。资源成员关系保存在各文件的属性元数据中。
          </p>
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

      <div v-if="definitions.containers.length" class="space-y-4">
        <section
          v-for="(container, containerIndex) in definitions.containers"
          :key="containerIndex"
          class="rounded-lg border bg-card/35"
        >
          <div class="grid grid-cols-[minmax(0,1fr)_9rem_auto] items-center gap-3 p-4 mobile:grid-cols-[minmax(0,1fr)_auto] mobile:gap-2 mobile:p-3">
            <label class="min-w-0">
              <span class="mb-1.5 block text-xs font-medium">名称</span>
              <Input
                :model-value="container.name"
                :disabled="readonly"
                class="h-8"
                placeholder="容器名称"
                @update:model-value="updateContainer(containerIndex, { name: String($event) })"
              />
            </label>
            <label class="mobile:col-start-1">
              <span class="mb-1.5 block text-xs font-medium">作用域</span>
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
                  <SelectItem value="root">root</SelectItem>
                  <SelectItem value="plugin">plugin</SelectItem>
                  <SelectItem value="global">global</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button
              v-if="!readonly"
              size="icon"
              variant="ghost"
              class="mt-5 size-8 mobile:col-start-2 mobile:row-start-1"
              title="删除容器"
              @click="removeContainer(containerIndex)"
            >
              <Trash2 class="size-4" />
            </Button>
            <label class="col-span-3 min-w-0 mobile:col-span-2">
              <span class="mb-1.5 block text-xs font-medium">
                说明
                <span class="font-normal text-muted-foreground">（可选）</span>
              </span>
              <Textarea
                :model-value="container.description ?? ''"
                :disabled="readonly"
                class="min-h-16 resize-y text-xs"
                placeholder="说明这个容器提供什么内容、适合在什么情况下引用"
                @update:model-value="
                  updateContainer(containerIndex, {
                    description: String($event),
                  })
                "
              />
            </label>
          </div>

          <p
            v-if="containerIssue(container)"
            class="border-t px-4 py-2 text-xs text-destructive mobile:px-3"
          >
            {{ containerIssue(container) }}
          </p>

          <div class="border-t px-4 pb-4 pt-3 mobile:px-3 mobile:pb-3">
            <div class="mb-2 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-xs font-medium">引用容器命名空间</h3>
                <p class="mt-0.5 text-[11px] text-muted-foreground">
                  引用保持命名空间，不会展开、复制或覆盖当前容器成员。
                </p>
              </div>
              <Button
                v-if="!readonly"
                size="sm"
                variant="ghost"
                class="h-7 px-2 text-xs"
                @click="addImport(containerIndex)"
              >
                <Plus class="mr-1 size-3.5" />
                添加引用
              </Button>
            </div>

            <div
              v-for="(item, importIndex) in container.imports"
              :key="importIndex"
              class="grid grid-cols-[11rem_minmax(0,1fr)_auto] items-center gap-2 py-1 mobile:grid-cols-[minmax(0,1fr)_auto]"
            >
              <Input
                :model-value="item.alias"
                :disabled="readonly"
                class="h-8 font-mono text-xs"
                placeholder="别名"
                @update:model-value="
                  updateImport(containerIndex, importIndex, {
                    alias: String($event),
                  })
                "
              />
              <Input
                :model-value="item.target"
                :disabled="readonly"
                class="h-8 font-mono text-xs mobile:col-start-1"
                placeholder="container:plugin/容器名称"
                @update:model-value="
                  updateImport(containerIndex, importIndex, {
                    target: String($event),
                  })
                "
              />
              <Button
                v-if="!readonly"
                size="icon"
                variant="ghost"
                class="size-8 mobile:col-start-2 mobile:row-start-1"
                title="删除导入"
                @click="removeImport(containerIndex, importIndex)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>

            <p
              v-if="container.imports.length === 0"
              class="py-2 text-xs text-muted-foreground"
            >
              当前容器没有引用其他容器命名空间。
            </p>
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
        root 只对插件根目录资源可见；plugin 对当前插件可见；global
        对当前启用的插件集合可见。
      </p>
    </div>
  </div>
</template>
