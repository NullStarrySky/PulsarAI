<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ListFilter, Plus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  maxPluginInsertDepth,
  pluginConditionDefinitions,
} from "@/features/Resources/Plugin/application/plugin-condition-environment";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import type {
  PluginResource,
  PluginResourceCondition,
} from "@/features/Resources/Plugin/domain/plugin-types";

const props = defineProps<{
  pluginId: string;
  containerId: string;
  resource: PluginResource;
}>();

const pluginStore = usePluginStore();
const open = ref(false);
const inserted = ref(props.resource.inserted);
const insertPosition = ref(props.resource.insertPosition);
const insertDepth = ref(props.resource.insertDepth);
const conditions = ref(props.resource.insertCondition.map(cloneCondition));
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const depthValue = computed({
  get: () => [insertDepth.value],
  set: (value: number[]) => {
    insertDepth.value = value[0] ?? insertDepth.value;
  },
});

watch(
  [inserted, insertPosition, insertDepth, conditions],
  schedulePersist,
  { deep: true },
);

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    void persist();
  }
});

function cloneCondition(condition: PluginResourceCondition): PluginResourceCondition {
  return {
    id: condition.id,
    functionName: condition.functionName,
    arguments: [...condition.arguments],
  };
}

function schedulePersist() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persist();
  }, 400);
}

async function persist() {
  await pluginStore.updateResource(
    props.pluginId,
    props.containerId,
    props.resource.id,
    {
      inserted: inserted.value,
      insertPosition: insertPosition.value.trim(),
      insertDepth: insertDepth.value,
      insertCondition: conditions.value.map(cloneCondition),
    },
  );
}

function conditionDefinition(functionName: string) {
  return pluginConditionDefinitions.find((definition) => definition.id === functionName)
    ?? pluginConditionDefinitions[pluginConditionDefinitions.length - 1]!;
}

function changeFunction(condition: PluginResourceCondition, functionName: string) {
  condition.functionName = functionName;
  condition.arguments = conditionDefinition(functionName).argumentPlaceholders.map(() => "");
}

function addCondition() {
  conditions.value.push({
    id: crypto.randomUUID(),
    functionName: "containKeyWord",
    arguments: [""],
  });
}

function removeCondition(conditionId: string) {
  conditions.value = conditions.value.filter((condition) => condition.id !== conditionId);
}

async function updateOpen(nextOpen: boolean) {
  open.value = nextOpen;
  if (!nextOpen && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await persist();
  }
}
</script>

<template>
  <Popover :open="open" @update:open="updateOpen">
    <PopoverTrigger as-child>
      <Button
        size="sm"
        :variant="inserted ? 'secondary' : 'outline'"
        class="h-7 gap-1.5 rounded-md px-2 text-xs font-medium active:translate-y-px"
        :title="inserted ? '编辑注入条件' : '配置注入'"
        @click.stop
      >
        <ListFilter class="size-3.5" />
        注入
        <span v-if="conditions.length" class="font-mono text-[10px] text-muted-foreground">
          {{ conditions.length }}
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      class="w-[min(31rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0"
      @click.stop
    >
      <div class="flex min-h-12 items-center justify-between border-b px-4">
        <div>
          <p class="text-sm font-semibold">注入规则</p>
          <p class="text-xs text-muted-foreground">所有条件都满足时注入资源</p>
        </div>
        <Switch v-model="inserted" aria-label="启用注入" />
      </div>

      <div class="grid gap-4 px-4 py-4">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-muted-foreground">注入位置</span>
          <Input
            v-model="insertPosition"
            class="h-8 font-mono text-xs"
            placeholder="例如 SYSTEM_PROMPT"
          />
        </label>

        <div class="grid gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">匹配深度</span>
            <span class="font-mono text-xs tabular-nums">{{ insertDepth }}</span>
          </div>
          <Slider v-model="depthValue" :min="1" :max="maxPluginInsertDepth" :step="1" />
          <p class="text-[11px] leading-4 text-muted-foreground">
            关键词和正则只检查最近 {{ insertDepth }} 条上下文消息。
          </p>
        </div>

        <div class="grid gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-muted-foreground">表达式</span>
            <span class="text-[11px] text-muted-foreground">{{ conditions.length }} 条</span>
          </div>

          <div v-if="conditions.length" class="grid gap-2">
            <div
              v-for="condition in conditions"
              :key="condition.id"
              class="grid grid-cols-[8.5rem_minmax(0,1fr)_2rem] items-center gap-2 mobile:grid-cols-[minmax(0,1fr)_2rem]"
            >
              <Select
                :model-value="condition.functionName"
                @update:model-value="changeFunction(condition, String($event))"
              >
                <SelectTrigger class="h-8 mobile:col-span-2">
                  <SelectValue placeholder="函数" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="definition in pluginConditionDefinitions"
                    :key="definition.id"
                    :value="definition.id"
                  >
                    {{ definition.label }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <div class="grid min-w-0 gap-2">
                <Input
                  v-for="(_, argumentIndex) in conditionDefinition(condition.functionName).argumentPlaceholders"
                  :key="argumentIndex"
                  v-model="condition.arguments[argumentIndex]"
                  class="h-8 min-w-0 font-mono text-xs"
                  :placeholder="conditionDefinition(condition.functionName).argumentPlaceholders[argumentIndex]"
                />
              </div>

              <Button
                size="icon"
                variant="ghost"
                class="size-8 text-muted-foreground hover:text-destructive"
                title="删除条件"
                @click="removeCondition(condition.id)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
          <p v-else class="py-2 text-xs text-muted-foreground">
            没有表达式时，只根据注入开关决定是否注入。
          </p>

          <Button
            variant="ghost"
            class="h-8 justify-start border border-dashed px-2 text-xs text-muted-foreground"
            @click="addCondition"
          >
            <Plus class="size-3.5" />
            新增表达式
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
