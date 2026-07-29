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
  MoreHorizontal,
  Paperclip,
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
import type {
  ActionPart,
  ChatMessage,
  ChatMessageContainer,
  ChatMessageMeta,
  ComponentPart,
  FilePart,
} from "@/features/Resources/Conversation/domain/conversation-types";
import { fileToMessagePart } from "@/features/Resources/Conversation/application/message-attachment";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { pluginMediaSource, pluginMediaType } from "@/features/Resources/Plugin/domain/plugin-media";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import ConversationActionPicker from "@/features/Resources/Conversation/presentation/ConversationActionPicker.vue";
import ConversationMarkdown from "@/features/Resources/Conversation/presentation/ConversationMarkdown.vue";
import GenerationComponentDialog from "@/features/Resources/Conversation/presentation/GenerationComponentDialog.vue";
import { getGenerationComponent } from "@/features/Resources/Conversation/presentation/generation-component-registry";
import MessageAttachmentStrip from "@/features/Resources/Conversation/presentation/MessageAttachmentStrip.vue";
import MessageActionBadge from "@/features/Resources/Conversation/presentation/MessageActionBadge.vue";
import NovelConversationRenderer from "@/features/Resources/Conversation/presentation/NovelConversationRenderer.vue";
import ConversationComposerToolbarTools from "@/features/Resources/Conversation/presentation/ConversationComposerToolbarTools.vue";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";

const props = defineProps<{
  packageId?: string;
  resourceId: string;
}>();

const conversation = useConversationStore();
const defaults = useDefaultConfigStore();
const translate = useTranslateStore();
const pluginStore = usePluginStore();
const appearance = useAppearanceStore();
const input = ref("");
const attachmentInput = ref<HTMLInputElement | null>(null);
const pendingAttachments = ref<FilePart[]>([]);
const selectedAction = ref<ActionPart | null>(null);
const attachmentTarget = ref<{ containerId: string; messageId: string } | null>(null);
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
const availableActions = computed(() =>
  pluginStore.actionResourcesForPackage(
    conversation.activePackageId,
    conversation.activePackage?.globalPluginOrder,
  ),
);
const conversationBackground = computed(() => {
  const resource = pluginStore.activeBackgroundResourceForPackage(
    conversation.activePackageId,
    conversation.activePackage?.globalPluginOrder,
  );
  const source = pluginMediaSource(resource?.content);
  return source
    ? { source, type: pluginMediaType(resource?.content, source) }
    : null;
});

onMounted(async () => {
  await Promise.all([conversation.initialize(), defaults.load(), pluginStore.initialize()]);
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

function componentParts(message?: ChatMessage | null): ComponentPart[] {
  return (message?.parts ?? []).filter(
    (part): part is ComponentPart => part.type === "component",
  );
}

function fileParts(message?: ChatMessage | null): FilePart[] {
  return (message?.parts ?? []).filter(
    (part): part is FilePart => part.type === "file",
  );
}

function actionPart(message?: ChatMessage | null) {
  return message?.parts?.find((part): part is ActionPart => part.type === "action") ?? null;
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
  const resolved = resolveComposerAction(input.value);
  const attachments = [...pendingAttachments.value];
  input.value = "";
  pendingAttachments.value = [];
  selectedAction.value = null;
  await conversation.send(resolved.content, undefined, attachments, resolved.action);
}

function resolveComposerAction(content: string) {
  if (selectedAction.value) {
    return { content, action: selectedAction.value };
  }
  const match = content.match(/^\s*\/([^\s]+)(?:\s+([\s\S]*))?$/);
  const commandName = match?.[1]?.toLocaleLowerCase();
  const matched = commandName
    ? availableActions.value.find(
        ({ resource }) => resource.name.trim().toLocaleLowerCase() === commandName,
      )
    : null;
  if (!matched) {
    return { content, action: null };
  }
  return {
    content: match?.[2] ?? "",
    action: {
      type: "action" as const,
      actionId: matched.resource.id,
      pluginId: matched.pluginId,
      pluginName: matched.pluginName,
      name: matched.resource.name,
      description: "",
    },
  };
}

function requestAttachments(container?: ChatMessageContainer) {
  const message = container ? messageOf(container) : null;
  attachmentTarget.value = container && message
    ? { containerId: container.id, messageId: message.id }
    : null;
  attachmentInput.value?.click();
}

async function onAttachmentsSelected(event: Event) {
  const element = event.target as HTMLInputElement;
  const files = Array.from(element.files ?? []);
  element.value = "";
  if (files.length === 0) {
    return;
  }

  try {
    const attachments = await Promise.all(files.map(fileToMessagePart));
    if (attachmentTarget.value) {
      await conversation.addMessageAttachments(
        attachmentTarget.value.containerId,
        attachmentTarget.value.messageId,
        attachments,
      );
    } else {
      pendingAttachments.value.push(...attachments);
    }
  } catch (error) {
    push.error(error instanceof Error ? error.message : "读取附件失败");
  } finally {
    attachmentTarget.value = null;
  }
}

async function removeMessageAttachment(
  container: ChatMessageContainer,
  index: number,
) {
  const message = messageOf(container);
  if (!message) {
    return;
  }
  await conversation.removeMessageAttachment(container.id, message.id, index);
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
  <div
    class="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
  >
    <video
      v-if="conversationBackground?.type === 'video'"
      :key="conversationBackground.source"
      :src="conversationBackground.source"
      class="pointer-events-none absolute inset-0 h-full w-full object-cover"
      autoplay
      muted
      loop
      playsinline
    />
    <img
      v-else-if="conversationBackground?.source"
      :src="conversationBackground.source"
      alt=""
      class="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />

    <section
      v-if="conversation.activeConversation?.rendererId !== 'novel'"
      class="relative min-h-0 flex-1 overflow-y-auto bg-background/80 px-5 pb-28 pt-6 backdrop-blur-[1px] mobile:px-3 mobile:pb-32 mobile:pt-4"
    >
      <div class="mx-auto flex max-w-4xl flex-col gap-4 mobile:gap-3">
        <div
          v-if="activePath.length === 0"
          class="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
        >
          {{ emptyPrompt }}
        </div>

        <article
          v-for="container in activePath"
          :key="container.id"
          :class="cn('flex gap-3 mobile:gap-2', container.role === 'user' && 'flex-row-reverse')"
          @pointerdown="onPointerDown"
          @pointerup="onPointerUp($event, container)"
        >
          <div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card mobile:size-8">
            <UserRound v-if="container.role === 'user'" class="size-4" />
            <Bot v-else class="size-4" />
          </div>

          <div :class="cn('min-w-0 max-w-[78%] mobile:max-w-[calc(100%_-_2.5rem)]', container.role === 'user' && 'items-end')">
            <div
              :class="
                cn(
                  'rounded-lg border bg-card px-3 py-2',
                  container.role === 'user' && 'bg-accent text-accent-foreground',
                )
              "
            >
              <MessageActionBadge
                v-if="actionPart(messageOf(container))"
                :action="actionPart(messageOf(container))!"
              />
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

              <MessageAttachmentStrip
                v-if="fileParts(messageOf(container)).length"
                :attachments="fileParts(messageOf(container))"
                :removable="container.role === 'user'"
                class="mb-2"
                @remove="removeMessageAttachment(container, $event)"
              />
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
              <template
                v-for="(part, partIndex) in componentParts(messageOf(container))"
                :key="`${messageOf(container)?.id}:${part.componentId}:${partIndex}`"
              >
                <component
                  :is="getGenerationComponent(part.componentId)"
                  v-if="getGenerationComponent(part.componentId)"
                  v-bind="part.props"
                  class="mt-3"
                />
              </template>
            </div>

            <div :class="cn('mt-1 flex min-w-0 items-center gap-1', container.role === 'user' && 'flex-row-reverse')">
              <div class="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-background/80 p-0.5 [scrollbar-width:none]">
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
                <Button
                  v-if="container.role === 'user'"
                  size="icon"
                  variant="ghost"
                  class="size-7"
                  title="附加文件"
                  @click="requestAttachments(container)"
                >
                  <Paperclip class="size-3.5" />
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

    <NovelConversationRenderer
      v-else
      :conversation-id="conversation.activeConversation?.id ?? ''"
      :containers="activePath"
      :generating="conversation.generating"
      :active-container-id="conversation.activeContainerId"
    />

    <footer class="mobile-safe-bottom pointer-events-none relative px-4 pb-4 mobile:px-2 mobile:pb-2">
      <div class="pointer-events-auto relative mx-auto max-w-3xl rounded-lg border bg-card/95 p-2 shadow-lg shadow-background/20 backdrop-blur mobile:rounded-xl">
        <ConversationActionPicker
          v-model="input"
          v-model:selected-action="selectedAction"
          :actions="availableActions"
        />
        <MessageAttachmentStrip
          v-if="pendingAttachments.length"
          :attachments="pendingAttachments"
          removable
          class="mb-1"
          @remove="pendingAttachments.splice($event, 1)"
        />
        <ConversationComposerEditor v-model="input" @submit="send" />
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-1">
            <ConversationComposerToolbarTools
              :tool-ids="appearance.composerToolbar.left"
              @attach="requestAttachments()"
              @whiteboard="whiteboardOpen = true"
              @fullscreen="fullscreenInputOpen = true"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <ConversationComposerToolbarTools
              :tool-ids="appearance.composerToolbar.right"
              @attach="requestAttachments()"
              @whiteboard="whiteboardOpen = true"
              @fullscreen="fullscreenInputOpen = true"
            />
            <Button
              size="icon"
              class="size-8 mobile:size-10"
              title="发送"
              :disabled="(!input.trim() && pendingAttachments.length === 0 && !selectedAction) || conversation.generating"
              @click="send"
            >
              <Send class="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </footer>

    <input
      ref="attachmentInput"
      class="hidden"
      type="file"
      multiple
      @change="onAttachmentsSelected"
    />

    <Dialog v-model:open="fullscreenInputOpen">
      <DialogContent class="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>输入消息</DialogTitle>
        </DialogHeader>
        <MessageAttachmentStrip
          v-if="pendingAttachments.length"
          :attachments="pendingAttachments"
          removable
          @remove="pendingAttachments.splice($event, 1)"
        />
        <div class="relative">
          <ConversationActionPicker
            v-model="input"
            v-model:selected-action="selectedAction"
            :actions="availableActions"
            menu-placement="below"
          />
          <Textarea
            v-model="input"
            class="min-h-[46vh] resize-none"
            placeholder="输入消息..."
            @keydown.enter.exact.prevent="fullscreenInputOpen = false; send()"
          />
        </div>
        <DialogFooter>
          <Button
            size="icon"
            variant="ghost"
            class="mr-auto"
            title="附加文件"
            @click="requestAttachments()"
          >
            <Paperclip class="size-4" />
          </Button>
          <Button variant="outline" @click="fullscreenInputOpen = false">取消</Button>
          <Button
            :disabled="(!input.trim() && pendingAttachments.length === 0 && !selectedAction) || conversation.generating"
            @click="fullscreenInputOpen = false; send()"
          >
            <Send data-icon="inline-start" />
            发送
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="whiteboardOpen">
      <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0">
        <iframe
          class="h-full w-full border-0 bg-background"
          src="https://excalidraw.com/"
          title="Excalidraw 白板"
          allow="clipboard-read; clipboard-write"
        />
      </DialogContent>
    </Dialog>

    <GenerationComponentDialog />
  </div>
</template>
