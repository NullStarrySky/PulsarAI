<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Clipboard, Copy, Scissors } from "lucide-vue-next";

const open = ref(false);
const x = ref(0);
const y = ref(0);
let target: HTMLElement | null = null;

onMounted(() => {
  document.addEventListener("contextmenu", onContextMenu, { capture: true });
  document.addEventListener("pointerdown", close, { capture: true });
  window.addEventListener("blur", close);
});

onBeforeUnmount(() => {
  document.removeEventListener("contextmenu", onContextMenu, { capture: true });
  document.removeEventListener("pointerdown", close, { capture: true });
  window.removeEventListener("blur", close);
});

function editableTarget(value: EventTarget | null) {
  const element = value instanceof HTMLElement ? value : null;
  return element?.closest<HTMLElement>(
    "input:not([type='button']):not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true']",
  ) ?? null;
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault();
  const editable = editableTarget(event.target);
  if (!editable) {
    close();
    return;
  }
  target = editable;
  x.value = Math.min(event.clientX, window.innerWidth - 176);
  y.value = Math.min(event.clientY, window.innerHeight - 132);
  open.value = true;
}

function close() {
  open.value = false;
}

function inputElement() {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    ? target
    : null;
}

function selectedText() {
  const input = inputElement();
  if (input) {
    return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
  }
  return window.getSelection()?.toString() ?? "";
}

function replaceSelection(value: string) {
  const input = inputElement();
  if (input) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(value, start, end, "end");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value,
    }));
    input.focus();
    return;
  }
  target?.focus();
  document.execCommand("insertText", false, value);
}

async function copy() {
  const value = selectedText();
  if (value) {
    await navigator.clipboard.writeText(value);
  }
  close();
}

async function cut() {
  const value = selectedText();
  if (value) {
    await navigator.clipboard.writeText(value);
    replaceSelection("");
  }
  close();
}

async function paste() {
  try {
    replaceSelection(await navigator.clipboard.readText());
  } finally {
    close();
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed z-[100] w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <button type="button" class="flex h-8 w-full items-center rounded-sm px-2 text-sm hover:bg-accent" @click="cut">
      <Scissors class="mr-2 size-4" />
      剪切
    </button>
    <button type="button" class="flex h-8 w-full items-center rounded-sm px-2 text-sm hover:bg-accent" @click="copy">
      <Copy class="mr-2 size-4" />
      复制
    </button>
    <button type="button" class="flex h-8 w-full items-center rounded-sm px-2 text-sm hover:bg-accent" @click="paste">
      <Clipboard class="mr-2 size-4" />
      粘贴
    </button>
  </div>
</template>
