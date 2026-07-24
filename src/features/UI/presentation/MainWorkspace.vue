<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { push } from "notivue";
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Maximize2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserRound,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import type { ChatMessageContainer } from "@/features/Resources/Conversation/domain/conversation-types";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { useLayoutStore } from "../application/layout-store";

const conversation = useConversationStore();
const defaults = useDefaultConfigStore();
const layout = useLayoutStore();
const input = ref("");
const fullscreenInputOpen = ref(false);
const editing = reactive({
  containerId: "",
  messageId: "",
  content: "",
});
const pointerStartX = ref<number | null>(null);
const hasConversationTab = computed(() => Boolean(layout.activeTab?.conversationId));

const activePath = computed(() =>
  hasConversationTab.value
    ? conversation.activePath.filter((container) => container.role !== "system" || conversation.currentMessage(container)?.content)
    : [],
);

onMounted(async () => {
  await Promise.all([conversation.initialize(), defaults.load()]);
  const active = conversation.activeConversation;
  if (active) {
    layout.openConversationTab({
      packageId: active.packageId,
      conversationId: active.id,
      title: active.title,
    });
  }
});

function messageOf(container: ChatMessageContainer) {
  return conversation.currentMessage(container);
}

function messageIndexLabel(container: ChatMessageContainer) {
  const index = container.activeMessage === null ? 0 : container.activeMessage + 1;
  return `${index}/${Math.max(container.content.length, 1)}`;
}

function startEdit(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) {
    return;
  }

  editing.containerId = container.id;
  editing.messageId = message.id;
  editing.content = message.content;
}

async function saveEdit() {
  await conversation.editMessage(editing.containerId, editing.messageId, editing.content);
  editing.containerId = "";
  editing.messageId = "";
  editing.content = "";
}

async function copyMessage(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) {
    return;
  }

  await navigator.clipboard.writeText(message.content);
  push.success("已复制");
}

async function send() {
  const content = input.value;
  input.value = "";
  await conversation.send(content);
}

async function switchSiblingMessage(container: ChatMessageContainer, direction: -1 | 1) {
  const active = container.activeMessage ?? 0;
  const nextIndex = active + direction;

  if (nextIndex >= container.content.length) {
    await conversation.regenerate(container.id);
    return;
  }

  await conversation.switchMessage(container.id, Math.max(0, nextIndex));
}

function onPointerDown(event: PointerEvent) {
  pointerStartX.value = event.clientX;
}

async function onPointerUp(event: PointerEvent, container: ChatMessageContainer) {
  if (pointerStartX.value === null) {
    return;
  }

  const delta = event.clientX - pointerStartX.value;
  pointerStartX.value = null;

  if (Math.abs(delta) < 48) {
    return;
  }

  await switchSiblingMessage(container, delta < 0 ? 1 : -1);
}
</script>

<template>
  <main class="flex min-h-0 flex-1 flex-col bg-background">
    <section v-if="!hasConversationTab" class="flex min-h-0 flex-1 items-center justify-center bg-muted/10">
      <div class="text-center text-sm text-muted-foreground">
        主界面测试区
      </div>
    </section>

    <section v-else class="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-6">
      <div class="mx-auto flex max-w-4xl flex-col gap-4">
        <div
          v-if="activePath.length === 0"
          class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
        >
          选择角色包后开始对话。
        </div>

        <article
          v-for="container in activePath"
          :key="container.id"
          :class="cn('flex gap-3', container.role === 'user' && 'flex-row-reverse')"
          @pointerdown="onPointerDown"
          @pointerup="onPointerUp($event, container)"
        >
          <div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card">
            <UserRound v-if="container.role === 'user'" class="size-4" />
            <Bot v-else class="size-4" />
          </div>

          <div :class="cn('min-w-0 max-w-[78%]', container.role === 'user' && 'items-end')">
            <div
              :class="
                cn(
                  'rounded-lg border bg-card px-3 py-2',
                  container.role === 'user' && 'bg-accent text-accent-foreground',
                )
              "
            >
              <Textarea
                v-if="editing.containerId === container.id"
                v-model="editing.content"
                class="min-h-28 resize-y"
                @keydown.ctrl.enter.prevent="saveEdit"
              />
              <p v-else class="whitespace-pre-wrap text-sm leading-6">
                {{ messageOf(container)?.content || (conversation.generating && container.id === conversation.activeContainerId ? "生成中..." : "") }}
              </p>
            </div>

            <div :class="cn('mt-1 flex items-center gap-1', container.role === 'user' && 'flex-row-reverse')">
              <div class="flex items-center gap-0.5 rounded-md bg-background/80 p-0.5">
                <Button size="icon" variant="ghost" class="size-7" @click="switchSiblingMessage(container, -1)">
                  <ChevronLeft class="size-4" />
                </Button>

                <Popover>
                  <PopoverTrigger as-child>
                    <Button variant="ghost" class="h-7 px-2 text-xs">
                      {{ messageIndexLabel(container) }}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-56 p-2">
                    <div class="mb-2 flex gap-1">
                      <Button size="sm" variant="outline" class="h-8 flex-1" @click="conversation.addMessage(container.id)">
                        <Plus class="size-3.5" />
                        新消息
                      </Button>
                      <Button size="icon" variant="outline" class="size-8" @click="conversation.deleteActiveMessage(container.id)">
                        <Trash2 class="size-3.5" />
                      </Button>
                    </div>
                    <div class="grid grid-cols-6 gap-1">
                      <Button
                        v-for="(_, index) in container.content"
                        :key="index"
                        size="icon"
                        :variant="container.activeMessage === index ? 'default' : 'ghost'"
                        class="size-8"
                        @click="conversation.switchMessage(container.id, index)"
                      >
                        {{ index + 1 }}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button size="icon" variant="ghost" class="size-7" @click="switchSiblingMessage(container, 1)">
                  <ChevronRight class="size-4" />
                </Button>

                <Button
                  v-if="editing.containerId === container.id"
                  size="icon"
                  variant="ghost"
                  class="size-7"
                  @click="saveEdit"
                >
                  <Check class="size-3.5" />
                </Button>
                <Button v-else size="icon" variant="ghost" class="size-7" @click="startEdit(container)">
                  <Pencil class="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" class="size-7" @click="copyMessage(container)">
                  <Copy class="size-3.5" />
                </Button>
                <Button v-if="container.role !== 'user'" size="icon" variant="ghost" class="size-7" @click="conversation.regenerate(container.id)">
                  <RefreshCw class="size-3.5" />
                </Button>

                <Popover v-if="container.role !== 'user'">
                  <PopoverTrigger as-child>
                    <Button size="icon" variant="ghost" class="relative size-7">
                      <GitBranch class="size-3.5" />
                      <span
                        v-if="conversation.branchIdsFor(container.id).length > 1"
                        class="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground"
                      >
                        {{ conversation.branchIdsFor(container.id).length }}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-56 p-2">
                    <div class="mb-2 flex gap-1">
                      <Button size="sm" variant="outline" class="h-8 flex-1" @click="conversation.createBranch(container.id)">
                        <Plus class="size-3.5" />
                        新分支
                      </Button>
                      <Button size="icon" variant="outline" class="size-8" @click="conversation.deleteContainer(container.id)">
                        <Trash2 class="size-3.5" />
                      </Button>
                    </div>
                    <div class="grid grid-cols-5 gap-1">
                      <Button
                        v-for="(branchId, index) in conversation.branchIdsFor(container.id)"
                        :key="branchId"
                        size="icon"
                        :variant="conversation.activeBranchIdFor(container.id) === branchId ? 'default' : 'ghost'"
                        class="size-8"
                        @click="conversation.switchBranch(container.id, branchId)"
                      >
                        {{ index + 1 }}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Button size="icon" variant="ghost" class="size-7">
                  <MoreHorizontal class="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <footer v-if="hasConversationTab" class="pointer-events-none px-4 pb-4">
      <div class="pointer-events-auto mx-auto max-w-3xl rounded-lg border bg-card/95 p-2 shadow-lg shadow-background/20 backdrop-blur">
        <Textarea
          v-model="input"
          class="min-h-12 resize-none border-0 bg-transparent py-2 text-sm shadow-none focus-visible:ring-0"
          placeholder="输入消息..."
          @keydown.enter.exact.prevent="send"
        />
        <div class="flex items-center justify-between gap-2">
          <ModelSelect
            :model-value="defaults.defaultChatModel"
            icon-only
            button-class="size-8 p-0"
            @update:model-value="defaults.setDefaultChatModel"
          />
          <div class="flex items-center gap-1">
            <Button size="icon" variant="ghost" class="size-8" title="全屏输入" @click="fullscreenInputOpen = true">
              <Maximize2 class="size-4" />
            </Button>
            <Button size="icon" class="size-8" title="发送" :disabled="!input.trim() || conversation.generating" @click="send">
              <Send class="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </footer>

    <Dialog v-model:open="fullscreenInputOpen">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>输入消息</DialogTitle>
        </DialogHeader>
        <Textarea
          v-model="input"
          class="min-h-[46vh] resize-none"
          placeholder="输入消息..."
          @keydown.enter.exact.prevent="fullscreenInputOpen = false; send()"
        />
        <DialogFooter>
          <Button variant="outline" @click="fullscreenInputOpen = false">取消</Button>
          <Button
            :disabled="!input.trim() || conversation.generating"
            @click="fullscreenInputOpen = false; send()"
          >
            <Send data-icon="inline-start" />
            发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
</template>
