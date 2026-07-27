<script setup lang="ts">
import { Play } from "lucide-vue-next";
import type { ActionPart } from "@/features/Resources/Conversation/domain/conversation-types";

defineProps<{
  action: ActionPart;
}>();
</script>

<template>
  <div class="mb-2 flex justify-start">
    <div class="flex max-w-full items-center gap-2 rounded-md border bg-muted/45 px-2.5 py-1 text-xs">
      <Play class="size-3.5 shrink-0 text-primary" />
      <span class="shrink-0 font-mono font-medium">/{{ action.name }}</span>
      <span v-if="action.description" class="truncate text-muted-foreground">
        {{ action.description }}
      </span>
    </div>
  </div>
</template>
