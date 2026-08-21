<script setup lang="ts">
import { MessageSquarePlus } from "lucide-vue-next";
import { computed, watch } from "vue";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useChatStore } from "./chat-store";

const props = defineProps<{ packageId: string; chatId: string }>();
const emit = defineEmits<{ select: [chatId: string] }>();
const chats = useChatStore();
const items = computed(() => props.packageId ? chats.chatsForPackage(props.packageId) : []);
const selected = computed(() => items.value.find((item) => item.id === props.chatId) ?? null);

async function create() {
  if (!props.packageId) return;
  emit("select", (await chats.create({ packageId: props.packageId, activate: false })).id);
}

watch(
  () => [props.packageId, props.chatId] as const,
  async ([packageId, chatId]) => {
    if (!packageId) return;
    await chats.loadForPackage(packageId);
    if (items.value.some((item) => item.id === chatId)) return;
    emit("select", (items.value[0] ?? await chats.create({ packageId, activate: false })).id);
  },
  { immediate: true },
);
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="sm" data-window-drag-block>{{ selected?.title || '对话' }}</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-56">
      <DropdownMenuLabel>对话</DropdownMenuLabel>
      <DropdownMenuItem v-for="item in items" :key="item.id" @click="emit('select', item.id)">{{ item.title }}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="create"><MessageSquarePlus />新建对话</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
