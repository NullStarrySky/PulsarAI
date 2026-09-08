<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { cn } from "../../../lib/utils";
import { useIcon } from "../../../lib/icon-context";
import { useSize } from "../../../lib/size-context";
import { useSurface } from "../../../lib/surface-context";
import { SURFACE_BG } from "../../../lib/surface-classes";
import { useDropdownSearchHost } from "./dropdown-context";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    clearOnClose?: boolean;
    autoFocus?: boolean;
    class?: any;
  }>(),
  {
    modelValue: "",
    placeholder: "搜索…",
    clearOnClose: true,
    autoFocus: true,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

defineOptions({ name: "DropdownSearch" });

const SearchIcon = useIcon("search");
const sizeClasses = useSize();
const compact = computed(() => sizeClasses.value.variant === "compact");
const surface = useSurface();
const host = useDropdownSearchHost();
const inputRef = ref<HTMLInputElement | null>(null);

const internalValue = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => {
    internalValue.value = v;
  }
);

function updateValue(val: string) {
  internalValue.value = val;
  emit("update:modelValue", val);
}

if (host) {
  const unregister = host.register({
    get input() {
      return inputRef.value;
    },
    append: (text: string) => updateValue(internalValue.value + text),
    deleteBackward: () => updateValue(internalValue.value.slice(0, -1)),
  });
  onUnmounted(() => unregister());
}

// 自动对焦与重置
if (host) {
  watch(
    () => host.open.value,
    (isOpen) => {
      if (!isOpen) return;
      if (props.clearOnClose && internalValue.value !== "") {
        updateValue("");
      }
      if (!props.autoFocus) return;
      nextTick(() => {
        requestAnimationFrame(() => {
          inputRef.value?.focus();
        });
      });
    },
    { immediate: true }
  );
}

// 过滤时保持第一行高亮
watch(
  [() => internalValue.value, () => host?.open.value],
  () => {
    if (!host || document.activeElement !== inputRef.value) return;
    host.highlightFirst();
  }
);

function menuRows(from: HTMLElement | null): HTMLElement[] {
  const menu = from?.closest<HTMLElement>('[role="menu"]');
  if (!menu) return [];
  const ROW_SELECTOR = [
    '[role="menuitem"]:not([aria-disabled="true"])',
    '[role="menuitemradio"]:not([aria-disabled="true"])',
    '[role="menuitemcheckbox"]:not([aria-disabled="true"])',
  ].join(", ");
  return Array.from(menu.querySelectorAll<HTMLElement>(ROW_SELECTOR));
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented) return;
  if (e.key === "Escape" || e.key === "Tab") return;
  e.stopPropagation();

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    const rows = menuRows(e.currentTarget as HTMLElement);
    if (rows.length === 0) return;
    e.preventDefault();
    (e.key === "ArrowDown" ? rows[0] : rows[rows.length - 1])?.focus();
  } else if (e.key === "Enter") {
    e.preventDefault();
    menuRows(e.currentTarget as HTMLElement)[0]?.click();
  }
}
</script>

<template>
  <div
    :class="
      cn(
        'group/search sticky top-0 z-20 -mx-1 -mt-1 mb-0.5 flex shrink-0 items-center border-b border-border/60',
        SURFACE_BG[surface],
        sizeClasses.control,
        sizeClasses.gap,
        compact ? 'px-2.5' : 'px-3',
        props.class
      )
    "
  >
    <SearchIcon
      :size="sizeClasses.icon"
      :stroke-width="1.5"
      class="shrink-0 text-muted-foreground transition-[color,stroke-width] duration-80 group-focus-within/search:text-foreground group-focus-within/search:stroke-[2]"
    />
    <input
      ref="inputRef"
      type="text"
      role="searchbox"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      :value="internalValue"
      :placeholder="placeholder"
      :class="
        cn(
          'min-w-0 flex-1 rounded-none bg-transparent text-foreground placeholder:text-muted-foreground outline-none font-[inherit]',
          sizeClasses.text,
          compact ? 'leading-5' : 'leading-6'
        )
      "
      @input="updateValue(($event.target as HTMLInputElement).value)"
      @keydown="handleKeyDown"
    />
  </div>
</template>
