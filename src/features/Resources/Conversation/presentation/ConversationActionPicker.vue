<script setup lang="ts">
import { computed } from "vue";
import { Play, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type { ActionPart } from "@/features/Resources/Conversation/domain/conversation-types";
import type { ResolvedPluginAction } from "@/features/Resources/Plugin/domain/plugin-types";

const props = defineProps<{
  modelValue: string;
  selectedAction: ActionPart | null;
  actions: ResolvedPluginAction[];
  menuPlacement?: "above" | "below";
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:selectedAction": [value: ActionPart | null];
}>();

const commandQuery = computed(() => {
  if (props.selectedAction) {
    return null;
  }
  const match = props.modelValue.match(/^\s*\/([^\s]*)$/);
  return match ? (match[1] ?? "").toLocaleLowerCase() : null;
});

const filteredActions = computed(() => {
  if (commandQuery.value === null) {
    return [];
  }
  return props.actions.filter(({ resource }) => {
    const haystack = `${resource.name}\n${resource.description}`.toLocaleLowerCase();
    return !commandQuery.value || haystack.includes(commandQuery.value);
  });
});

function chooseAction(action: ResolvedPluginAction) {
  emit("update:selectedAction", {
    type: "action",
    actionId: action.resource.id,
    pluginId: action.pluginId,
    pluginName: action.pluginName,
    name: action.resource.name,
    description: action.resource.description,
  });
  emit("update:modelValue", "");
}
</script>

<template>
  <div class="relative">
    <div v-if="selectedAction" class="mb-1.5 flex items-center">
      <div class="flex min-w-0 items-center gap-2 rounded-md border bg-muted/45 py-1 pl-2.5 pr-1 text-xs">
        <Play class="size-3.5 shrink-0 text-primary" />
        <span class="shrink-0 font-mono font-medium">/{{ selectedAction.name }}</span>
        <span v-if="selectedAction.description" class="max-w-72 truncate text-muted-foreground mobile:max-w-40">
          {{ selectedAction.description }}
        </span>
        <Button
          size="icon"
          variant="ghost"
          class="size-6"
          title="移除 Action"
          @click="emit('update:selectedAction', null)"
        >
          <X class="size-3.5" />
        </Button>
      </div>
    </div>

    <div
      v-if="commandQuery !== null"
      class="absolute left-0 right-0 z-20 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      :class="props.menuPlacement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2'"
    >
      <div class="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        选择 Action
      </div>
      <div class="max-h-64 overflow-y-auto p-1.5">
        <button
          v-for="action in filteredActions"
          :key="`${action.pluginId}:${action.resource.id}`"
          type="button"
          class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent active:translate-y-px"
          @mousedown.prevent
          @click="chooseAction(action)"
        >
          <Play class="mt-0.5 size-3.5 text-muted-foreground" />
          <span class="min-w-0">
            <span class="block truncate font-mono text-sm font-medium">/{{ action.resource.name }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted-foreground">
              {{ action.resource.description || "没有描述" }}
            </span>
          </span>
        </button>
        <p v-if="filteredActions.length === 0" class="px-2.5 py-5 text-center text-xs text-muted-foreground">
          没有匹配的 Action
        </p>
      </div>
    </div>
  </div>
</template>
