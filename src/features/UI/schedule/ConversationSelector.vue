<script setup lang="ts">
import { Check, ChevronsUpDown, Search } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const conversation = useConversationStore();
const query = ref("");
const open = ref(false);

onMounted(() => {
  void conversation.initialize();
});

const selected = computed(() => conversation.conversations.find((item) => item.id === props.modelValue));
const conversations = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return conversation.conversations
    .filter((item) => !keyword || item.title.toLowerCase().includes(keyword))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
});
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" class="w-full justify-between font-normal">
        <span class="truncate">{{ selected?.title ?? "选择对话" }}</span>
        <ChevronsUpDown class="size-4 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-[var(--reka-popover-trigger-width)] p-2" align="start">
      <div class="relative mb-2">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="query" class="h-8 pl-8" placeholder="搜索对话" />
      </div>
      <div class="max-h-64 overflow-y-auto">
        <button
          v-for="item in conversations"
          :key="item.id"
          class="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent"
          type="button"
          @click="emit('update:modelValue', item.id); open = false"
        >
          <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
          <Check v-if="item.id === modelValue" class="size-4" />
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
