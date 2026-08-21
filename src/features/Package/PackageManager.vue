<script setup lang="ts">
import { Plus, Users } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePackageStore } from "./package-store";

const props = defineProps<{ packageId: string }>();
const emit = defineEmits<{ select: [packageId: string] }>();
const packages = usePackageStore();
const selected = () => packages.packages.find((item) => item.id === props.packageId) ?? null;

async function create() {
  const item = await packages.create();
  emit("select", item.id);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" data-window-drag-block><Users />{{ selected()?.name || '角色包' }}</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-56">
      <DropdownMenuLabel>角色包</DropdownMenuLabel>
      <DropdownMenuItem v-for="item in packages.sortedPackages" :key="item.id" @click="emit('select', item.id)">{{ item.name }}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="create"><Plus />新建角色包</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
