<script setup lang="ts">
import { onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { FileCheck2, MessageSquare, MoreHorizontal, Plus, Search, Trash2, Wrench } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import InlineEditInput from "@/features/UI/presentation/InlineEditInput.vue";

const layout = useLayoutStore();
const conversation = useConversationStore();
const { rightSidebarOpen } = storeToRefs(layout);
const tab = ref<"conversation" | "plugin">("conversation");
const editingConversationId = ref("");
const editingConversationTitle = ref("");

onMounted(() => {
  void conversation.initialize();
});

async function openConversation(conversationId: string) {
  conversation.openConversation(conversationId);
  const active = conversation.activeConversation;
  if (active) {
    layout.openResourceTab({
      resourceType: "conversation",
      resourceId: active.id,
      packageId: active.packageId,
      title: active.title,
    });
  }
}

async function createConversation() {
  await conversation.createConversation();
  const active = conversation.activeConversation;
  if (active) {
    layout.openResourceTab({
      resourceType: "conversation",
      resourceId: active.id,
      packageId: active.packageId,
      title: active.title,
    });
  }
}

function startRenameConversation(conversationId: string) {
  const item = conversation.conversations.find((conversationItem) => conversationItem.id === conversationId);
  if (!item) {
    return;
  }

  editingConversationId.value = conversationId;
  editingConversationTitle.value = item.title;
}

async function confirmRenameConversation() {
  const item = conversation.conversations.find((conversationItem) => conversationItem.id === editingConversationId.value);
  if (!item) {
    return;
  }

  const title = editingConversationTitle.value.trim() || item.title;
  await conversation.updateConversation(item.id, { title });
  layout.openResourceTab({
    resourceType: "conversation",
    resourceId: item.id,
    packageId: item.packageId,
    title,
  });
  editingConversationId.value = "";
  editingConversationTitle.value = "";
}

async function deleteConversation(conversationId: string) {
  layout.closeTabsByResource("conversation", conversationId);
  await conversation.deleteConversation(conversationId);
}

async function toggleConversationTemplate(conversationId: string) {
  const item = conversation.conversations.find((conversationItem) => conversationItem.id === conversationId);
  if (!item) {
    return;
  }

  await conversation.updateConversation(item.id, { isTemplate: !item.isTemplate });
}
</script>

<template>
  <aside
    :class="
      cn(
        'flex shrink-0 flex-col overflow-hidden border-l bg-background transition-[width,opacity] duration-300 ease-out',
        rightSidebarOpen ? 'w-72 opacity-100' : 'w-0 opacity-0',
      )
    "
  >
    <div class="min-w-72 border-b p-2">
      <div class="grid grid-cols-2 rounded-md bg-muted p-1">
        <Button
          :variant="tab === 'conversation' ? 'secondary' : 'ghost'"
          class="h-8"
          @click="tab = 'conversation'"
        >
          <MessageSquare data-icon="inline-start" />
          对话
        </Button>
        <Button :variant="tab === 'plugin' ? 'secondary' : 'ghost'" class="h-8" @click="tab = 'plugin'">
          <Wrench data-icon="inline-start" />
          插件
        </Button>
      </div>
    </div>

    <template v-if="tab === 'conversation'">
      <div class="flex min-w-72 items-center gap-2 border-b p-2">
        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="conversation.conversationSearch" class="h-8 pl-8" placeholder="搜索对话" />
        </div>
        <Button size="icon" variant="ghost" class="size-8" title="新建对话" @click="createConversation">
          <Plus class="size-4" />
        </Button>
      </div>

      <div class="min-w-72 flex-1 overflow-y-auto p-2">
        <ContextMenu
          v-for="item in conversation.activePackageConversations"
          :key="item.id"
        >
          <ContextMenuTrigger as-child>
            <div
              role="button"
              :class="
                cn(
                  'group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                  item.id === conversation.activeConversationId && 'bg-accent text-accent-foreground',
                )
              "
              @click="openConversation(item.id)"
            >
              <InlineEditInput
                v-if="editingConversationId === item.id"
                v-model="editingConversationTitle"
                placeholder="对话名称"
                @click.stop
                @confirm="confirmRenameConversation"
                @cancel="editingConversationId = ''"
              />
              <span v-else class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 truncate text-sm font-medium">{{ item.title }}</span>
                <span
                  v-if="item.isTemplate"
                  class="inline-flex h-5 shrink-0 items-center gap-1 rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground"
                >
                  <FileCheck2 class="size-3" />
                  模板
                </span>
              </span>

              <DropdownMenu v-if="editingConversationId !== item.id">
                <DropdownMenuTrigger as-child>
                  <Button size="icon" variant="ghost" class="size-7 opacity-70" title="对话菜单" @click.stop>
                    <MoreHorizontal class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-40">
                  <DropdownMenuItem @click="startRenameConversation(item.id)">重命名</DropdownMenuItem>
                  <DropdownMenuItem @click="toggleConversationTemplate(item.id)">
                    <FileCheck2 class="mr-2 size-4" />
                    {{ item.isTemplate ? "取消模板" : "设为模板" }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteConversation(item.id)">
                    <Trash2 class="mr-2 size-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-40">
            <ContextMenuItem @click="startRenameConversation(item.id)">重命名</ContextMenuItem>
            <ContextMenuItem @click="toggleConversationTemplate(item.id)">
              <FileCheck2 class="mr-2 size-4" />
              {{ item.isTemplate ? "取消模板" : "设为模板" }}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" @click="deleteConversation(item.id)">
              <Trash2 class="mr-2 size-4" />
              删除
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </template>

    <div v-else class="min-w-72 flex-1 p-4 text-sm text-muted-foreground">
      插件将在后续阶段接入。
    </div>
  </aside>
</template>
