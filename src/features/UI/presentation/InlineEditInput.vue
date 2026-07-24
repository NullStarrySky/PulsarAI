<script setup lang="ts">
import { Check } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

defineProps<{
  placeholder?: string;
}>();

const model = defineModel<string>({ required: true });

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <div class="absolute inset-x-1 top-1 z-20 grid grid-cols-[minmax(0,1fr)_2.25rem] gap-1 rounded-lg border bg-popover p-1 shadow-md">
    <Input
      v-model="model"
      autofocus
      class="h-8 border-0 bg-muted shadow-none focus-visible:ring-0"
      :placeholder="placeholder"
      @click.stop
      @keydown.enter.prevent="emit('confirm')"
      @keydown.esc.prevent="emit('cancel')"
    />
    <Button size="icon" variant="ghost" class="size-8" title="确认" @click.stop="emit('confirm')">
      <Check class="size-4" />
    </Button>
  </div>
</template>
