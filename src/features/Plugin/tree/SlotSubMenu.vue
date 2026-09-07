<script setup lang="ts">
import {
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	MenuItem,
} from "@/components/fluid";
import type { SlotMenuNode } from "./slot-menu-types";

defineProps<{
	nodes: SlotMenuNode[];
	selectedSlot: string;
}>();

const emit = defineEmits<{
	(e: "select", path: string): void;
}>();
</script>

<template>
  <template v-for="node in nodes" :key="node.slot.path">
    <DropdownMenuSub v-if="node.children.length > 0">
      <DropdownMenuSubTrigger :label="node.slot.name" />
      <DropdownMenuSubContent class="w-56">
        <SlotSubMenu
          :nodes="node.children"
          :selected-slot="selectedSlot"
          @select="emit('select', $event)"
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
    <MenuItem
      v-else
      :label="node.slot.name"
      :checked="selectedSlot === node.slot.path"
      @select="emit('select', node.slot.path)"
    />
  </template>
</template>
