export type ComponentResource = {
  id: string;
  name: string;
  source: string;
};

export function createDefaultComponentContent(name = "CounterButton") {
  return `<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
</script>

<template>
  <button
    class="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/15"
    @click="count += 1"
  >
    ${name}: {{ count }}
  </button>
</template>
`;
}
