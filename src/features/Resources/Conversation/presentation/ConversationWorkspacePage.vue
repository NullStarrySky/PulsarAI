<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { push } from "notivue";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  GitBranch,
  Languages,
  Maximize2,
  MoreHorizontal,
  Pencil,
  PenTool,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import { useTranslateStore } from "@/features/Translate/application/translate-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import type { ChatMessageContainer, ChatMessageMeta } from "@/features/Resources/Conversation/domain/conversation-types";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import ConversationMarkdown from "@/features/Resources/Conversation/presentation/ConversationMarkdown.vue";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";

const props = defineProps<{
  packageId?: string;
  resourceId: string;
}>();

const conversation = useConversationStore();
const defaults = useDefaultConfigStore();
const translate = useTranslateStore();
const input = ref("");
const fullscreenInputOpen = ref(false);
const whiteboardOpen = ref(false);
const editing = reactive({
  containerId: "",
  messageId: "",
  content: "",
});
const pointerStartX = ref<number | null>(null);

const activePath = computed(() =>
  conversation.activePath.filter((container) => container.role !== "system" || conversation.currentMessage(container)?.content),
);
const emptyPrompt = computed(() => `今天想和 ${conversation.activePackage?.name ?? "Pulsar"} 聊点什么？`);

onMounted(async () => {
  await Promise.all([conversation.initialize(), defaults.load()]);
  openResourceConversation();
});

watch(() => props.resourceId, openResourceConversation);
watch(() => conversation.lastMessageEditRequestId, () => {
  const container = conversation.activeContainer;
  if (container) {
    startEdit(container);
  }
});

function openResourceConversation() {
  if (props.resourceId && conversation.activeConversationId !== props.resourceId) {
    conversation.openConversation(props.resourceId);
  }
}

function messageOf(container: ChatMessageContainer) {
  return conversation.currentMessage(container);
}

function messageIndexLabel(container: ChatMessageContainer) {
  const index = container.activeMessage === null ? 0 : container.activeMessage + 1;
  return `${index}/${Math.max(container.content.length, 1)}`;
}

type MessageStep = ChatMessageMeta["steps"][number];

function visibleSteps(container: ChatMessageContainer) {
  return (messageOf(container)?.meta.steps ?? []).filter((step) => {
    if ("type" in step) {
      return step.type === "tool-result" || step.type === "sub-agent";
    }
    return !step.name.startsWith("agent:");
  });
}

function stepTitle(step: MessageStep) {
  if ("type" in step && step.type === "tool-result") {
    return `调用工具：${step.toolName}`;
  }
  if ("type" in step && step.type === "sub-agent") {
    return `${step.name} · ${step.status}`;
  }
  return step.name;
}

function stepBody(step: MessageStep) {
  if ("type" in step && step.type === "tool-result") {
    return stringifyStepValue(step.output);
  }
  return step.message || "";
}

function stringifyStepValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "output" in value) {
    const output = (value as { output?: unknown }).output;
    return typeof output === "string" ? output : JSON.stringify(output, null, 2);
  }
  return JSON.stringify(value, null, 2);
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

async function translateMessage(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message?.content.trim() || translate.translating) {
    return;
  }

  try {
    const translated = await translate.translateText(message.content, true);
    await conversation.editMessage(container.id, message.id, translated);
    push.success("已翻译");
  } catch {
    push.error(translate.errorText || "翻译失败");
  }
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
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <section class="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-6">
      <div class="mx-auto flex max-w-4xl flex-col gap-4">
        <div
          v-if="activePath.length === 0"
          class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
        >
          {{ emptyPrompt }}
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
              <details
                v-if="editing.containerId !== container.id && visibleSteps(container).length"
                class="mb-2 overflow-hidden rounded-md border bg-muted/35 text-xs text-muted-foreground"
              >
                <summary class="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-medium text-foreground">
                  <ChevronDown class="size-3.5" />
                  过程 {{ visibleSteps(container).length }}
                </summary>
                <div class="divide-y">
                  <div
                    v-for="(step, index) in visibleSteps(container)"
                    :key="index"
                    class="grid gap-1 px-2.5 py-2"
                  >
                    <div class="font-medium text-foreground">{{ stepTitle(step) }}</div>
                    <pre
                      v-if="stepBody(step)"
                      class="max-h-36 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-[11px] leading-4"
                    >{{ stepBody(step) }}</pre>
                  </div>
                </div>
              </details>

              <ConversationComposerEditor
                v-if="editing.containerId === container.id"
                v-model="editing.content"
                placeholder="编辑消息..."
                @submit="saveEdit"
              />
              <ConversationMarkdown
                v-else
                :model-value="messageOf(container)?.content || (conversation.generating && container.id === conversation.activeContainerId ? '生成中...' : '')"
              />
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

                <DropdownMenu v-if="container.role !== 'user'">
                  <DropdownMenuTrigger as-child>
                    <Button size="icon" variant="ghost" class="size-7">
                      <MoreHorizontal class="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-40">
                    <DropdownMenuItem :disabled="translate.translating || !messageOf(container)?.content.trim()" @click="translateMessage(container)">
                      <Languages class="mr-2 size-4" />
                      翻译输出
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <footer class="pointer-events-none px-4 pb-4">
      <div class="pointer-events-auto mx-auto max-w-3xl rounded-lg border bg-card/95 p-2 shadow-lg shadow-background/20 backdrop-blur">
        <ConversationComposerEditor v-model="input" @submit="send" />
        <div class="flex items-center justify-between gap-2">
          <ModelSelect
            :model-value="defaults.defaultChatModel"
            icon-only
            button-class="size-8 p-0"
            @update:model-value="defaults.setDefaultChatModel"
          />
          <div class="flex items-center gap-1">
            <Button size="icon" variant="ghost" class="size-8" title="白板" @click="whiteboardOpen = true">
              <PenTool class="size-4" />
            </Button>
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

    <Dialog v-model:open="whiteboardOpen">
      <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none">
        <iframe
          class="h-full w-full border-0 bg-background"
          src="https://excalidraw.com/"
          title="Excalidraw 白板"
          allow="clipboard-read; clipboard-write"
        />
      </DialogContent>
    </Dialog>
  </div>
</template>
