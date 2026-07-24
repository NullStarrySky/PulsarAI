<script setup lang="ts">
import { Maximize2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>

<template>
  <div class="relative w-full sm:w-80">
    <Textarea
      :model-value="modelValue"
      :placeholder="placeholder"
      class="min-h-24 pr-10"
      @update:model-value="emit('update:modelValue', String($event))"
    />
    <Dialog>
      <DialogTrigger as-child>
        <Button variant="ghost" size="icon" class="absolute right-1.5 top-1.5 size-7" title="弹窗编辑">
          <Maximize2 class="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑翻译提示词</DialogTitle>
        </DialogHeader>
        <Textarea
          :model-value="modelValue"
          class="min-h-[420px]"
          @update:model-value="emit('update:modelValue', String($event))"
        />
        <DialogFooter>
          <Button>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
