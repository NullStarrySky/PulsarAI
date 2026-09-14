<script setup lang="ts">
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { RotateCcw, X } from "@/lib/phosphor-icons";

defineProps<{
	modelValue: string;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
	reset: [];
	clear: [];
}>();

function record(event: KeyboardEvent) {
	event.preventDefault();
	event.stopPropagation();
	const hotkey = [
		event.ctrlKey && "Ctrl",
		event.altKey && "Alt",
		event.shiftKey && "Shift",
		event.metaKey && "Meta",
		!["Control", "Alt", "Shift", "Meta"].includes(event.key) &&
			(event.key.length === 1 ? event.key.toUpperCase() : event.key),
	]
		.filter(Boolean)
		.join("+");
	if (hotkey) {
		emit("update:modelValue", hotkey);
	}
}
</script>

<template>
  <div class="flex w-full items-center justify-end gap-2">
    <Input
      class="h-9 min-w-0 flex-1 text-right font-mono"
      :model-value="modelValue"
      placeholder="点击后按下快捷键"
      readonly
      @keydown="record"
    />
    <Button size="icon" variant="ghost" title="重置" @click="$emit('reset')">
      <RotateCcw class="size-4" />
    </Button>
    <Button size="icon" variant="ghost" title="清除" @click="$emit('clear')">
      <X class="size-4" />
    </Button>
  </div>
</template>
