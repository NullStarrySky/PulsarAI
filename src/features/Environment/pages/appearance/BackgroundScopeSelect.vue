<script setup lang="ts">
import { computed, ref } from "vue";
import {
	PopoverContent,
	PopoverPortal,
	PopoverRoot,
	PopoverTrigger,
} from "reka-ui";
import { motion } from "motion-v";
import { CheckboxGroup, CheckboxItem } from "@/components/fluid";
import { spring } from "@/components/fluid/lib/springs";
import type { BackgroundScope } from "@/features/Environment/defaults";
import { ChevronDown } from "@/lib/remix-icons";

const props = withDefaults(
	defineProps<{
		modelValue?: BackgroundScope[];
	}>(),
	{
		modelValue: () => ["blank", "conversation", "settings"],
	},
);

const emit = defineEmits<{
	(e: "update:modelValue", value: BackgroundScope[]): void;
}>();

const open = ref(false);

const scopeOptions: { id: BackgroundScope; label: string }[] = [
	{ id: "blank", label: "空白会话" },
	{ id: "conversation", label: "会话" },
	{ id: "settings", label: "设置" },
];

const checkedIndices = computed(() => {
	const current = props.modelValue ?? [];
	const indices = new Set<number>();
	scopeOptions.forEach((opt, idx) => {
		if (current.includes(opt.id)) indices.add(idx);
	});
	return indices;
});

const summaryText = computed(() => {
	const current = props.modelValue ?? [];
	if (current.length === scopeOptions.length) {
		return "全部 (空白会话、会话、设置)";
	}
	if (current.length === 0) {
		return "未选择任何界面";
	}
	return scopeOptions
		.filter((opt) => current.includes(opt.id))
		.map((opt) => opt.label)
		.join("、");
});

function toggleScope(id: BackgroundScope) {
	const current = [...(props.modelValue ?? [])];
	const index = current.indexOf(id);
	if (index >= 0) {
		current.splice(index, 1);
	} else {
		current.push(id);
	}
	emit("update:modelValue", current);
}

function selectAll() {
	emit("update:modelValue", ["blank", "conversation", "settings"]);
}

function clearAll() {
	emit("update:modelValue", []);
}
</script>

<template>
  <PopoverRoot v-model:open="open" :modal="false">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="group inline-flex h-9 w-60 items-center justify-between rounded-lg border border-border bg-background/60 px-3 text-xs text-foreground transition-all duration-100 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span class="truncate text-left font-medium" :class="props.modelValue?.length ? 'text-foreground' : 'text-muted-foreground'">
          {{ summaryText }}
        </span>
        <ChevronDown
          class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground"
          :class="open && 'rotate-180'"
        />
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        as-child
        side="bottom"
        align="end"
        :side-offset="6"
        class="z-50 outline-none"
      >
        <motion.div
          class="flex w-56 flex-col overflow-hidden rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-lg backdrop-blur-md"
          :initial="{ opacity: 0, y: -4, scaleY: 0.96 }"
          :animate="open ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: -4, scaleY: 0.96 }"
          :transition="spring.fast"
          style="transform-origin: top right;"
        >
          <div class="px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
            勾选背景显示的范围
          </div>

          <CheckboxGroup
            :checked-indices="checkedIndices"
            class="w-full"
          >
            <CheckboxItem
              v-for="(opt, idx) in scopeOptions"
              :key="opt.id"
              :index="idx"
              :checked="(props.modelValue ?? []).includes(opt.id)"
              class="w-full text-xs"
              @toggle="toggleScope(opt.id)"
            >
              {{ opt.label }}
            </CheckboxItem>
          </CheckboxGroup>

          <div class="mt-1 flex items-center justify-between border-t border-border/60 px-1 pt-1.5 text-[11px]">
            <button
              type="button"
              class="rounded px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="selectAll"
            >
              全选
            </button>
            <button
              type="button"
              class="rounded px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="clearAll"
            >
              清空
            </button>
          </div>
        </motion.div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
