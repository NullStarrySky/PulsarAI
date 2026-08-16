<script setup lang="ts">
import { computed, ref } from "vue";
import { Check } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import type { AskSuggestionAnswer, AskSuggestionOption } from "../runtime/ask-suggestion-tool";

const props = defineProps<{
  title: string;
  options: AskSuggestionOption[];
}>();

const emit = defineEmits<{
  resolve: [value: AskSuggestionAnswer];
  cancel: [];
}>();

const selected = ref(0);
const drawerOpen = ref(false);
const accepted = ref(false);

const activeOption = computed(() => props.options[selected.value] ?? props.options[0]);
const others = computed(() =>
  props.options
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => i !== selected.value)
);

function selectOption(index: number) {
  selected.value = index;
  accepted.value = false;
  drawerOpen.value = false;
}

function handleAccept() {
  accepted.value = true;
  if (activeOption.value) {
    emit("resolve", {
      selectedKey: activeOption.value.key,
      selectedOption: activeOption.value,
      accepted: true,
    });
  }
}
</script>

<template>
  <div class="w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
    <div class="p-4">
      <h4 class="text-sm font-semibold text-foreground">
        {{ title }}
      </h4>
      <div
        :key="activeOption?.key"
        class="mt-2 min-h-12 text-xs leading-relaxed text-muted-foreground animate-in fade-in-50 duration-200"
      >
        <div v-html="activeOption?.body" />
      </div>
    </div>

    <!-- Alternatives drawer -->
    <div
      class="grid transition-all duration-300 ease-out"
      :class="drawerOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="overflow-hidden">
        <div class="border-t border-border bg-muted/40 px-3 py-2">
          <p class="px-1 pb-1 text-[11px] font-medium text-muted-foreground">
            备选方案 (Other options)
          </p>
          <div class="flex flex-col gap-1">
            <button
              v-for="{ o, i } in others"
              :key="o.key"
              type="button"
              class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="selectOption(i)"
            >
              <!-- Signal Meter -->
              <span class="flex items-end gap-0.5">
                <span
                  v-for="bar in [0, 1, 2]"
                  :key="bar"
                  class="w-1 rounded-full transition-colors duration-200"
                  :class="bar < o.signal ? 'bg-primary' : 'bg-muted-foreground/20'"
                  style="height: 10px"
                />
              </span>
              <span class="min-w-0 flex-1 truncate text-foreground font-medium">
                {{ o.short }}
              </span>
              <span class="shrink-0 text-[11px] text-muted-foreground">
                {{ o.label }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-2.5">
      <span class="flex items-center gap-2">
        <span class="flex items-end gap-0.5">
          <span
            v-for="bar in [0, 1, 2]"
            :key="bar"
            class="w-1 rounded-full transition-colors duration-200"
            :class="bar < (activeOption?.signal ?? 0) ? 'bg-primary' : 'bg-muted-foreground/20'"
            style="height: 10px"
          />
        </span>
        <span class="text-xs font-medium text-muted-foreground">
          {{ activeOption?.label }}
        </span>
      </span>

      <span class="flex items-center gap-2">
        <Button
          v-if="others.length > 0"
          type="button"
          variant="outline"
          size="sm"
          class="h-7 px-2.5 text-xs"
          :class="{ 'bg-accent text-accent-foreground': drawerOpen }"
          @click="drawerOpen = !drawerOpen"
        >
          备选方案
        </Button>
        <Button
          type="button"
          size="sm"
          class="h-7 px-3 text-xs transition-colors"
          :variant="accepted ? 'default' : 'default'"
          @click="handleAccept"
        >
          <Check v-if="accepted" class="mr-1 size-3.5" />
          {{ accepted ? '已接受' : (activeOption?.cta || '确认') }}
        </Button>
      </span>
    </div>
  </div>
</template>
