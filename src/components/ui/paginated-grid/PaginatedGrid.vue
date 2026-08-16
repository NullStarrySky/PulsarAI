<script setup lang="ts" generic="T">
import { computed, ref, watch } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

const props = withDefaults(
  defineProps<{
    items: T[];
    columns?: number;
    rows?: number;
  }>(),
  { columns: 4, rows: 5 },
);

const emit = defineEmits<{
  select: [item: T];
}>();

const page = ref(0);
const pageSize = computed(() => Math.max(1, props.columns * props.rows));
const pageCount = computed(() => Math.max(1, Math.ceil(props.items.length / pageSize.value)));
const visibleItems = computed(() =>
  props.items.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value),
);
const padCount = computed(() => pageSize.value - visibleItems.value.length);

watch(pageCount, (count) => {
  if (page.value >= count) {
    page.value = count - 1;
  }
});
</script>

<template>
  <div class="w-full">
    <div class="grid gap-1" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
      <button
        v-for="(item, index) in visibleItems"
        :key="page * pageSize + index"
        type="button"
        class="flex aspect-square items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="emit('select', item)"
      >
        <slot name="cell" :item="item" :index="page * pageSize + index" />
      </button>
      <span
        v-for="n in padCount"
        :key="`pad-${n}`"
        aria-hidden="true"
        class="pointer-events-none aspect-square"
      />
    </div>
    <div v-if="pageCount > 1" class="mt-1 flex items-center justify-between px-1">
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :disabled="page === 0"
        :title="'上一页'"
        @click="page -= 1"
      >
        <ChevronLeft class="size-4" />
      </Button>
      <span class="text-xs tabular-nums text-muted-foreground">{{ page + 1 }} / {{ pageCount }}</span>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :disabled="page >= pageCount - 1"
        :title="'下一页'"
        @click="page += 1"
      >
        <ChevronRight class="size-4" />
      </Button>
    </div>
  </div>
</template>
