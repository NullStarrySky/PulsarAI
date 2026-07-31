<script setup lang="ts">
import { computed, nextTick, onActivated, onMounted, reactive, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { push } from "notivue";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  GitBranch,
  Languages,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Star,
  StarOff,
  Trash2,
  UserRound,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
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
import {
  applyPluginRegexToText,
  collectPluginRegexRules,
} from "@/features/Resources/Plugin/domain/plugin-regex";
import PluginConversationOverride from "@/features/Resources/Plugin/presentation/PluginConversationOverride.vue";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import ConversationActionPicker from "@/features/Resources/Conversation/presentation/ConversationActionPicker.vue";
import ConversationMessageContent from "@/features/Resources/Conversation/presentation/ConversationMessageContent.vue";
import GenerationComponentDialog from "@/features/Resources/Conversation/presentation/GenerationComponentDialog.vue";
import { getGenerationComponent } from "@/features/Resources/Conversation/presentation/generation-component-registry";
import MessageAttachmentStrip from "@/features/Resources/Conversation/presentation/MessageAttachmentStrip.vue";
import MessageActionBadge from "@/features/Resources/Conversation/presentation/MessageActionBadge.vue";
import NovelConversationRenderer from "@/features/Resources/Conversation/presentation/NovelConversationRenderer.vue";
import ConversationComposerToolbarTools from "@/features/Resources/Conversation/presentation/ConversationComposerToolbarTools.vue";
import ConversationBranchMapDialog from "@/features/Resources/Conversation/presentation/ConversationBranchMapDialog.vue";
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
const branchMapOpen = ref(false);
const branchMapTargetId = ref("");
const messageViewport = ref<{ element: HTMLElement | null } | null>(null);
const editing = reactive({
  containerId: "",
  messageId: "",
  content: "",
});
const pointerStartX = ref<number | null>(null);
const handledNavigationRequestId = ref(0);

const activePath = computed(() =>
  conversation.activePath.filter((container) => container.role !== "system" || conversation.currentMessage(container)?.content),
);
const latestMessageContainerId = computed(
  () => activePath.value[activePath.value.length - 1]?.id ?? "",
);
const messageVirtualizer = useVirtualizer(
  computed(() => ({
    count: activePath.value.length,
    getScrollElement: () => messageViewport.value?.element ?? null,
    estimateSize: () => 180,
    getItemKey: (index: number) =>
      activePath.value[index]?.id ?? index,
    gap: 16,
    overscan: 6,
    paddingStart: 24,
    paddingEnd: 128,
  })),
);
const virtualMessages = computed(() =>
  messageVirtualizer.value.getVirtualItems().flatMap((virtualRow) => {
    const container = activePath.value[virtualRow.index];
    return container ? [{ container, virtualRow }] : [];
  }),
);
const virtualContentHeight = computed(
  () => messageVirtualizer.value.getTotalSize(),
);
const emptyPrompt = computed(() => `今天想和 ${conversation.activePackage?.name ?? "Pulsar"} 聊点什么？`);
const availableActions = computed(() =>
  pluginStore.actionResourcesForPackage(
    conversation.activePackageId,
    conversation.activePackage?.globalPluginOrder,
  ),
);
const renderingRegexRules = computed(() =>
  collectPluginRegexRules(
    pluginStore.enabledPluginsForPackage(
      conversation.activePackageId,
      conversation.activePackage?.globalPluginOrder,
    ),
  ).value,
);
const renderedNovelPath = computed(() =>
  activePath.value.map((container, index) => {
    const message = messageOf(container);
    if (!message) return container;
    const rendered = renderMessageContent(container, index);
    if (rendered === message.content) return container;
    return {
      ...container,
      content: container.content.map((candidate) =>
        candidate.id === message.id
          ? { ...candidate, content: rendered }
          : candidate,
      ),
    };
  }),
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
  await handleMessageNavigationRequest();
});
onActivated(async () => {
  openResourceConversation();
  await handleMessageNavigationRequest();
});

watch(() => props.resourceId, async () => {
  openResourceConversation();
  await handleMessageNavigationRequest();
});
watch(() => conversation.lastMessageEditRequestId, () => {
  const container = conversation.activeContainer;
  if (container) {
    startEdit(container);
  }
});
watch(
  () => conversation.messageNavigationRequest?.requestId,
  () => {
    void handleMessageNavigationRequest();
  },
);

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
  if (!message) {
    return;
  }

  if (message.meta.translation) {
    const restored = await conversation.restoreMessageOriginal(
      container.id,
      message.id,
    );
    if (restored) {
      push.success("已还原原文");
    }
    return;
  }
  if (!message.content.trim() || translate.translating) {
    return;
  }

  try {
    const translated = await translate.translateText(message.content, true);
    const updated = await conversation.setMessageTranslation(
      container.id,
      message.id,
      translated,
    );
    if (updated) {
      push.success("已翻译，可从更多菜单还原原文");
    }
  } catch {
    push.error(translate.errorText || "翻译失败");
  }
}

async function send() {
  const resolved = resolveComposerAction(input.value);
  if (resolved.promptContent !== undefined) {
    input.value = resolved.promptContent;
    selectedAction.value = null;
    return;
  }
  const attachments = [...pendingAttachments.value];
  input.value = "";
  pendingAttachments.value = [];
  selectedAction.value = null;
  await conversation.send(resolved.content, undefined, attachments, resolved.action);
}

function resolveComposerAction(content: string) {
  if (selectedAction.value) {
    return { content, action: selectedAction.value, promptContent: undefined };
  }
  const match = content.match(/^\s*\/([^\s]+)(?:\s+([\s\S]*))?$/);
  const commandName = match?.[1]?.toLocaleLowerCase();
  const matched = commandName
    ? availableActions.value.find(
        ({ resource }) => resource.name.trim().toLocaleLowerCase() === commandName,
      )
    : null;
  if (!matched) {
    return { content, action: null, promptContent: undefined };
  }
  if (matched.kind === "prompt") {
    return {
      content,
      action: null,
      promptContent:
        typeof matched.resource.content === "string"
          ? matched.resource.content
          : JSON.stringify(matched.resource.content, null, 2),
    };
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
    promptContent: undefined,
  };
}

function renderMessageContent(
  container: ChatMessageContainer,
  knownIndex = activePath.value.findIndex((item) => item.id === container.id),
) {
  const message = messageOf(container);
  if (!message) return "";
  const index = knownIndex >= 0 ? knownIndex : activePath.value.length - 1;
  return applyPluginRegexToText(message.content, {
    role: container.role,
    depthFromEnd: activePath.value.length - index,
    rules: renderingRegexRules.value,
    rendering: true,
  }).value;
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

async function toggleMessageFavorite(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) {
    return;
  }

  const favorite = !message.favorite;
  const updated = await conversation.setMessageFavorite(
    container.id,
    message.id,
    favorite,
  );
  if (updated) {
    push.success(favorite ? "已收藏消息" : "已取消收藏");
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

function measureVirtualMessage(element: unknown) {
  if (element instanceof Element) {
    messageVirtualizer.value.measureElement(element);
  }
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

async function onBranchMapNavigate(containerId: string) {
  branchMapTargetId.value = "";
  await nextTick();
  branchMapTargetId.value = containerId;
  await nextTick();
  const virtualIndex = activePath.value.findIndex(
    (container) => container.id === containerId,
  );
  if (
    virtualIndex >= 0
    && conversation.activeConversation?.rendererId !== "novel"
  ) {
    messageVirtualizer.value.scrollToIndex(virtualIndex, {
      align: "center",
      behavior: "auto",
    });
    return;
  }
  window.requestAnimationFrame(() => {
    const target = Array.from(
      document.querySelectorAll<HTMLElement>("[data-message-id]"),
    ).find((element) => element.dataset.messageId === containerId);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

async function handleMessageNavigationRequest() {
  const request = conversation.messageNavigationRequest;
  if (
    !request
    || request.conversationId !== props.resourceId
    || request.requestId <= handledNavigationRequestId.value
  ) {
    return;
  }

  handledNavigationRequestId.value = request.requestId;
  await onBranchMapNavigate(request.containerId);
  conversation.completeMessageNavigation(request.requestId);
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

    <PluginConversationOverride
      :package-id="conversation.activePackageId"
      :global-plugin-order="conversation.activePackage?.globalPluginOrder"
    >
    <MessageScrollerProvider
      v-if="conversation.activeConversation?.rendererId !== 'novel'"
      auto-scroll
      default-scroll-position="last-anchor"
    >
      <MessageScroller class="relative min-h-0 flex-1 bg-background/80 backdrop-blur-[1px]">
        <MessageScrollerViewport ref="messageViewport">
          <MessageScrollerContent
            :virtual-count="activePath.length"
            class="relative block min-h-full w-full max-w-none gap-0 p-0"
            :style="{
              height: activePath.length
                ? `${virtualContentHeight}px`
                : '100%',
            }"
          >
            <div
              v-if="activePath.length === 0"
              class="flex min-h-[40vh] items-center justify-center px-5 text-sm text-muted-foreground mobile:px-3"
            >
              {{ emptyPrompt }}
            </div>

            <div
              v-for="{ container, virtualRow } in virtualMessages"
              :key="virtualRow.key"
              :ref="measureVirtualMessage"
              :data-index="virtualRow.index"
              class="absolute left-0 top-0 w-full px-5 mobile:px-3"
              :style="{ transform: `translateY(${virtualRow.start}px)` }"
            >
              <MessageScrollerItem
                :message-id="container.id"
                :scroll-anchor="container.role === 'user'"
                class="mx-auto w-full max-w-4xl"
              >
              <Message
                :align="container.role === 'user' ? 'end' : 'start'"
                @pointerdown="onPointerDown"
                @pointerup="onPointerUp($event, container)"
              >
                <MessageAvatar class="size-9 rounded-md border bg-card mobile:size-8">
                  <UserRound v-if="container.role === 'user'" class="size-4" />
                  <CircleAlert
                    v-else-if="messageOf(container)?.type === 'error'"
                    class="size-4 text-destructive"
                  />
                  <Bot v-else class="size-4" />
                </MessageAvatar>

                <MessageContent class="max-w-[78%] mobile:max-w-[calc(100%_-_2.5rem)]">
                  <Bubble
                    :align="container.role === 'user' ? 'end' : 'start'"
                    :variant="
                      messageOf(container)?.type === 'error'
                        ? 'destructive'
                        : container.role === 'user'
                          ? 'tinted'
                          : 'outline'
                    "
                    class="max-w-full"
                  >
                    <BubbleContent
                      class="w-full"
                      :role="messageOf(container)?.type === 'error' ? 'alert' : undefined"
                    >
                      <Marker
                        v-if="messageOf(container)?.type === 'error'"
                        class="mb-2 text-destructive"
                      >
                        <MarkerIcon>
                          <CircleAlert />
                        </MarkerIcon>
                        <MarkerContent>运行错误</MarkerContent>
                      </Marker>
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
              <ConversationMessageContent
                v-else
                :content="renderMessageContent(container, virtualRow.index) || (conversation.activeConversationGenerating && container.id === conversation.activeContainerId ? '生成中...' : '')"
                :interactive-preview-enabled="appearance.interactiveCodePreview"
                :replace-with-preview="container.id === latestMessageContainerId"
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
                    </BubbleContent>
                  </Bubble>

                  <MessageFooter>
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

                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button size="icon" variant="ghost" class="size-7">
                      <MoreHorizontal class="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-40">
                    <DropdownMenuGroup>
                    <DropdownMenuItem
                      @click="toggleMessageFavorite(container)"
                    >
                      <StarOff
                        v-if="messageOf(container)?.favorite"
                        data-icon="inline-start"
                      />
                      <Star v-else data-icon="inline-start" />
                      {{ messageOf(container)?.favorite ? "取消收藏" : "收藏消息" }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="container.role !== 'user'"
                      :disabled="!messageOf(container)?.meta.translation && (translate.translating || !messageOf(container)?.content.trim())"
                      @click="translateMessage(container)"
                    >
                      <RotateCcw
                        v-if="messageOf(container)?.meta.translation"
                        data-icon="inline-start"
                      />
                      <Languages v-else data-icon="inline-start" />
                      {{ messageOf(container)?.meta.translation ? "还原原文" : "翻译输出" }}
                    </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
                  </MessageFooter>
                </MessageContent>
              </Message>
              </MessageScrollerItem>
            </div>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>

    <NovelConversationRenderer
      v-else
      :conversation-id="conversation.activeConversation?.id ?? ''"
      :containers="renderedNovelPath"
      :generating="conversation.activeConversationGenerating"
      :active-container-id="conversation.activeContainerId"
      :focus-container-id="branchMapTargetId"
    />
    </PluginConversationOverride>

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
              @map="branchMapOpen = true"
              @fullscreen="fullscreenInputOpen = true"
            />
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <ConversationComposerToolbarTools
              :tool-ids="appearance.composerToolbar.right"
              @attach="requestAttachments()"
              @whiteboard="whiteboardOpen = true"
              @map="branchMapOpen = true"
              @fullscreen="fullscreenInputOpen = true"
            />
            <Button
              size="icon"
              class="size-8 mobile:size-10"
              title="发送"
              :disabled="(!input.trim() && pendingAttachments.length === 0 && !selectedAction) || conversation.activeConversationGenerating"
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
            :disabled="(!input.trim() && pendingAttachments.length === 0 && !selectedAction) || conversation.activeConversationGenerating"
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

    <ConversationBranchMapDialog
      v-model:open="branchMapOpen"
      @navigate="onBranchMapNavigate"
    />

    <GenerationComponentDialog />
  </div>
</template>
