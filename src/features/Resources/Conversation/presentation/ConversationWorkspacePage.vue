<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { push } from "notivue";
import {
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
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
import type { ComposerToolId } from "@/features/UI/domain/composer-toolbar";
import { storeToRefs } from "pinia";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";

const props = defineProps<{
  packageId?: string;
  resourceId: string;
}>();

const conversation = useConversationStore();
const defaults = useDefaultConfigStore();
const translate = useTranslateStore();
const pluginStore = usePluginStore();
const appearance = useAppearanceStore();
const responsive = useResponsiveStore();
const { isMobileLayout } = storeToRefs(responsive);
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
const expandedStepMessageIds = reactive(new Set<string>());
const pointerStartX = ref<number | null>(null);
const handledNavigationRequestId = ref(0);
const promptOptimizationToolIds = computed<ComposerToolId[]>(() =>
  appearance.composerToolbar.unused.includes("optimize") ? [] : ["optimize"],
);

const activePath = computed(() =>
  conversation.activePath.filter((container) => container.role !== "system" || conversation.currentMessage(container)?.content),
);
const latestMessageContainerId = computed(
  () => activePath.value[activePath.value.length - 1]?.id ?? "",
);
const activeSelectedMessageGenerating = computed(() => {
  const container = conversation.activeContainer;
  return container ? isSelectedMessageGenerating(container) : false;
});
const messageVirtualizer = useVirtualizer(
  computed(() => ({
    count: activePath.value.length,
    getScrollElement: () => messageViewport.value?.element ?? null,
    estimateSize: () => 180,
    getItemKey: (index: number) =>
      activePath.value[index]?.id ?? index,
    gap: 16,
    overscan: 2,
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
    conversation.activePackage?.enabledGlobalPluginIds,
    conversation.activePackage?.mainPluginId,
  ),
);
const renderingRegexRules = computed(() =>
  collectPluginRegexRules(
    pluginStore.enabledPluginsForPackage(
      conversation.activePackageId,
      conversation.activePackage?.enabledGlobalPluginIds,
      conversation.activePackage?.mainPluginId,
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
    conversation.activePackage?.enabledGlobalPluginIds,
    conversation.activePackage?.mainPluginId,
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

watch(
  () => props.resourceId,
  () => {
    if (editing.containerId) {
      void saveEdit();
    }
  },
);

onDeactivated(() => {
  if (editing.containerId) {
    void saveEdit();
  }
});

onBeforeUnmount(() => {
  if (editing.containerId) {
    void saveEdit();
  }
});

function messageOf(container: ChatMessageContainer) {
  return conversation.currentMessage(container);
}

function isEditingMessage(container: ChatMessageContainer) {
  return editing.containerId === container.id
    && editing.messageId === messageOf(container)?.id;
}

function isSelectedMessageGenerating(container: ChatMessageContainer) {
  const generateInfo = messageOf(container)?.meta.generateInfo;
  return conversation.isConversationGenerating(container.conversationid)
    && generateInfo !== undefined
    && generateInfo.timeUsed === undefined;
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

function onStepsToggle(container: ChatMessageContainer, event: Event) {
  const messageId = messageOf(container)?.id;
  if (!messageId) return;
  if ((event.currentTarget as HTMLDetailsElement).open) {
    expandedStepMessageIds.add(messageId);
  } else {
    expandedStepMessageIds.delete(messageId);
  }
}

function stepToolName(step: MessageStep) {
  return "type" in step && step.type === "tool-result" ? step.toolName : null;
}

function stepBody(step: MessageStep) {
  const value = "type" in step && step.type === "tool-result"
    ? step.output
    : step.message || "";
  return stringifyStepValue(value);
}

function stringifyStepValue(value: unknown) {
  if (value && typeof value === "object" && "output" in value) {
    value = (value as { output?: unknown }).output;
  }
  const normalized = parseEmbeddedJson(value);
  return typeof normalized === "string"
    ? normalized
    : JSON.stringify(normalized, null, 2) ?? String(normalized ?? "");
}

function parseEmbeddedJson(value: unknown, depth = 0): unknown {
  if (depth >= 6) return value;
  if (typeof value === "string") {
    const source = value.trim();
    if (
      (source.startsWith("{") && source.endsWith("}"))
      || (source.startsWith("[") && source.endsWith("]"))
    ) {
      try {
        return parseEmbeddedJson(JSON.parse(source), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => parseEmbeddedJson(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        parseEmbeddedJson(item, depth + 1),
      ]),
    );
  }
  return value;
}

type StepCodeTokenKind = "key" | "string" | "number" | "literal" | "plain";

function stepCodeTokens(step: MessageStep) {
  const source = stepBody(step);
  if (source.length > 20_000) {
    return [{ text: source, kind: "plain" as const }];
  }
  const tokens: Array<{ text: string; kind: StepCodeTokenKind }> = [];
  const pattern = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > offset) {
      tokens.push({ text: source.slice(offset, index), kind: "plain" });
    }
    const text = match[0];
    const rest = source.slice(index + text.length);
    const kind: StepCodeTokenKind = text.startsWith('"')
      ? /^\s*:/.test(rest) ? "key" : "string"
      : /^(true|false|null)$/.test(text) ? "literal" : "number";
    tokens.push({ text, kind });
    offset = index + text.length;
  }
  if (offset < source.length) {
    tokens.push({ text: source.slice(offset), kind: "plain" });
  }
  return tokens;
}

function stepTokenClass(kind: StepCodeTokenKind) {
  if (kind === "key") return "text-primary";
  if (kind === "string") return "text-emerald-600 dark:text-emerald-400";
  if (kind === "number") return "text-amber-600 dark:text-amber-400";
  if (kind === "literal") return "text-violet-600 dark:text-violet-400";
  return "text-foreground/75";
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
  if (!input.value.trim()) return;
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

function onFullscreenKeydown(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const shouldSubmit = appearance.composerSendWithEnter
    ? !event.shiftKey
    : event.shiftKey;
  if (!shouldSubmit) return;
  event.preventDefault();
  fullscreenInputOpen.value = false;
  void send();
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
  if (editing.containerId) {
    await saveEdit();
  }
  const active = container.activeMessage ?? 0;
  const nextIndex = active + direction;

  if (nextIndex >= container.content.length) {
    await conversation.regenerate(container.id);
    return;
  }

  await conversation.switchMessage(container.id, Math.max(0, nextIndex));
}

async function switchSpecificMessage(containerId: string, index: number) {
  if (editing.containerId) {
    await saveEdit();
  }
  await conversation.switchMessage(containerId, index);
}

function onPointerDown(event: PointerEvent) {
  if (!isMobileLayout.value) return;
  pointerStartX.value = event.clientX;
}

function measureVirtualMessage(element: unknown) {
  if (element instanceof Element) {
    messageVirtualizer.value.measureElement(element);
  }
}

async function onPointerUp(event: PointerEvent, container: ChatMessageContainer) {
  if (!isMobileLayout.value) return;
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
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
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
              :key="String(virtualRow.key)"
              :ref="measureVirtualMessage"
              :data-index="virtualRow.index"
              class="group/message absolute left-0 top-0 w-full px-5 py-4 mobile:px-3"
              :style="{ transform: `translateY(${virtualRow.start}px)` }"
            >
              <MessageScrollerItem
                :message-id="container.id"
                :scroll-anchor="container.role === 'user'"
                class="mx-auto w-full max-w-4xl"
              >
              <Message
                :align="container.role === 'user' ? 'end' : 'start'"
                class="flex flex-col gap-2 items-start data-[align=end]:items-end w-full"
                @pointerdown="onPointerDown"
                @pointerup="onPointerUp($event, container)"
              >
                <MessageContent
                  class="w-full flex flex-col"
                  :class="[
                    container.role === 'user'
                      ? 'max-w-[85%] items-end mobile:max-w-full'
                      : 'max-w-full items-stretch'
                  ]"
                >
                  <!-- Collapsible accordion for steps (outside bubble, on top of it) -->
                  <details
                    v-if="!isEditingMessage(container) && visibleSteps(container).length"
                    class="group/details mb-2.5 w-full max-w-xl overflow-hidden rounded-lg border border-border/60 bg-transparent text-xs text-muted-foreground"
                    @toggle="onStepsToggle(container, $event)"
                  >
                    <summary class="flex cursor-pointer list-none select-none items-center gap-2 px-3 py-2 font-medium text-foreground/80 outline-none">
                       <ChevronDown class="size-3.5 transition-transform duration-200 group-open/details:rotate-180" />
                      <span class="font-medium">过程步骤 ({{ visibleSteps(container).length }})</span>
                    </summary>
                    <div
                      v-if="expandedStepMessageIds.has(messageOf(container)?.id ?? '')"
                      class="divide-y divide-border/40 border-t border-border/50 bg-transparent"
                    >
                      <div
                        v-for="(step, index) in visibleSteps(container)"
                        :key="index"
                        class="grid gap-1.5 px-3 py-2.5"
                      >
                        <div class="flex items-center gap-1.5 font-semibold text-foreground/90">
                          <span class="inline-block size-1.5 rounded-full bg-primary/75"></span>
                          <span v-if="stepToolName(step)">
                            调用工具：<code class="rounded bg-primary/10 px-1 py-0.5 font-mono text-[11px] font-semibold text-primary">{{ stepToolName(step) }}</code>
                          </span>
                          <span v-else>{{ stepTitle(step) }}</span>
                        </div>
                        <ScrollArea
                          v-if="stepBody(step)"
                          class="max-h-56 rounded-md border border-border/50 bg-muted/25"
                        >
                          <pre class="min-w-0 whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-[1.55] [overflow-wrap:anywhere]"><code><span
                            v-for="(token, tokenIndex) in stepCodeTokens(step)"
                            :key="tokenIndex"
                            :class="stepTokenClass(token.kind)"
                          >{{ token.text }}</span></code></pre>
                        </ScrollArea>
                      </div>
                    </div>
                  </details>

                  <Bubble
                    :align="container.role === 'user' ? 'end' : 'start'"
                    :variant="
                      messageOf(container)?.type === 'error'
                        ? 'ghost'
                        : container.role === 'user'
                          ? 'tinted'
                          : 'outline'
                    "
                    :class="[
                      isEditingMessage(container) ? 'w-full max-w-2xl' : 'max-w-full',
                      messageOf(container)?.type === 'error'
                        ? 'w-full max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-destructive shadow-none dark:bg-destructive/15'
                        : (container.role !== 'user' && 'border-0 bg-transparent shadow-none p-0')
                    ]"
                  >
                    <BubbleContent
                      :class="[
                        isEditingMessage(container) ? 'w-full p-3' : 'p-3',
                        messageOf(container)?.type === 'error'
                          ? '!w-full !rounded-none !bg-transparent !p-0 !text-destructive'
                          : (container.role !== 'user' && 'p-0 py-1.5 px-2')
                      ]"
                      :role="messageOf(container)?.type === 'error' ? 'alert' : undefined"
                    >
                      <Marker
                        v-if="messageOf(container)?.type === 'error'"
                        class="mb-2 text-destructive"
                      >
                        <MarkerIcon>
                          <CircleAlert class="size-4" />
                        </MarkerIcon>
                        <MarkerContent>运行错误</MarkerContent>
                      </Marker>

                      <MessageActionBadge
                        v-if="actionPart(messageOf(container))"
                        :action="actionPart(messageOf(container))!"
                        class="mt-2"
                      />

                      <MessageAttachmentStrip
                        v-if="fileParts(messageOf(container)).length"
                        :attachments="fileParts(messageOf(container))"
                        :removable="container.role === 'user'"
                        class="mt-2"
                        @remove="removeMessageAttachment(container, $event)"
                      />

                      <ConversationComposerEditor
                        v-if="isEditingMessage(container)"
                        v-model="editing.content"
                        placeholder="编辑消息..."
                        class="max-w-2xl w-full message-inline-editor"
                        @submit="saveEdit"
                      />

                      <ConversationMessageContent
                        v-else
                        :content="renderMessageContent(container, virtualRow.index) || (isSelectedMessageGenerating(container) ? '生成中...' : '')"
                        :compact="messageOf(container)?.type === 'error'"
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

                  <MessageFooter class="mt-1 w-full flex" :class="container.role === 'user' ? 'justify-end' : 'justify-start'">
                    <div class="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-transparent px-2 py-0.5 [scrollbar-width:none] transition-all opacity-0 group-hover/message:opacity-100 mobile:opacity-100 duration-200">
                      <Button size="icon" variant="ghost" class="size-7 rounded-full hover:bg-muted/80" @click="switchSiblingMessage(container, -1)">
                        <ChevronLeft class="size-4" />
                      </Button>

                      <Popover>
                        <PopoverTrigger as-child>
                          <Button variant="ghost" class="h-7 px-2 rounded-full text-xs font-semibold hover:bg-muted/80">
                            {{ messageIndexLabel(container) }}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent class="w-56 p-2 rounded-xl">
                          <div class="mb-2 flex gap-1">
                            <Button size="sm" variant="outline" class="h-8 flex-1 rounded-lg" @click="conversation.addMessage(container.id)">
                              <Plus class="size-3.5" />
                              新消息
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              class="size-8 rounded-lg"
                              title="删除当前版本"
                              :disabled="container.content.length <= 1"
                              @click="conversation.deleteActiveMessage(container.id)"
                            >
                              <Trash2 class="size-3.5" />
                            </Button>
                          </div>
                          <div class="grid grid-cols-6 gap-1">
                            <Button
                              v-for="(_, index) in container.content"
                              :key="index"
                              size="icon"
                              :variant="container.activeMessage === index ? 'default' : 'ghost'"
                              class="size-8 rounded-lg"
                              @click="switchSpecificMessage(container.id, index)"
                            >
                              {{ index + 1 }}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>

                      <Button size="icon" variant="ghost" class="size-7 rounded-full hover:bg-muted/80" @click="switchSiblingMessage(container, 1)">
                        <ChevronRight class="size-4" />
                      </Button>

                      <Button
                        v-if="isEditingMessage(container)"
                        size="icon"
                        variant="ghost"
                        class="size-7 rounded-full hover:bg-muted/80"
                        @click="saveEdit"
                      >
                        <Check class="size-3.5" />
                      </Button>
                      <Button v-else size="icon" variant="ghost" class="size-7 rounded-full hover:bg-muted/80" @click="startEdit(container)">
                        <Pencil class="size-3.5" />
                      </Button>
                      <Button
                        v-if="container.role === 'user'"
                        size="icon"
                        variant="ghost"
                        class="size-7 rounded-full hover:bg-muted/80"
                        title="附加文件"
                        @click="requestAttachments(container)"
                      >
                        <Paperclip class="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" class="size-7 rounded-full hover:bg-muted/80" @click="copyMessage(container)">
                        <Copy class="size-3.5" />
                      </Button>
                      <Button v-if="container.role !== 'user'" size="icon" variant="ghost" class="size-7 rounded-full hover:bg-muted/80" @click="conversation.regenerate(container.id)">
                        <RefreshCw class="size-3.5" />
                      </Button>

                      <Popover v-if="container.role !== 'user'">
                        <PopoverTrigger as-child>
                          <Button size="icon" variant="ghost" class="relative size-7 rounded-full hover:bg-muted/80">
                            <GitBranch class="size-3.5" />
                            <span
                              v-if="conversation.branchIdsFor(container.id).length > 1"
                              class="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground"
                            >
                              {{ conversation.branchIdsFor(container.id).length }}
                            </span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent class="w-56 p-2 rounded-xl">
                          <div class="mb-2 flex gap-1">
                            <Button size="sm" variant="outline" class="h-8 flex-1 rounded-lg" @click="conversation.createBranch(container.id)">
                              <Plus class="size-3.5" />
                              新分支
                            </Button>
                            <Button size="icon" variant="outline" class="size-8 rounded-lg" @click="conversation.deleteContainer(container.id)">
                              <Trash2 class="size-3.5" />
                            </Button>
                          </div>
                          <div class="grid grid-cols-5 gap-1">
                            <Button
                              v-for="(branchId, index) in conversation.branchIdsFor(container.id)"
                              :key="branchId"
                              size="icon"
                              :variant="conversation.activeBranchIdFor(container.id) === branchId ? 'default' : 'ghost'"
                              class="size-8 rounded-lg"
                              @click="conversation.switchBranch(container.id, branchId)"
                            >
                              {{ index + 1 }}
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>

                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <Button size="icon" variant="ghost" class="size-7 rounded-full hover:bg-muted/80">
                            <MoreHorizontal class="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" class="w-40 rounded-xl">
                          <DropdownMenuGroup>
                          <DropdownMenuItem
                            class="rounded-lg"
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
                            class="rounded-lg"
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
                          <DropdownMenuItem
                            class="rounded-lg text-destructive focus:text-destructive"
                            @click="conversation.deleteContainer(container.id)"
                          >
                            <Trash2 data-icon="inline-start" />
                            删除消息
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
      :generating="activeSelectedMessageGenerating"
      :active-container-id="conversation.activeContainerId"
      :focus-container-id="branchMapTargetId"
    />

    <footer class="mobile-safe-bottom pointer-events-none relative p-3">
      <div class="pointer-events-auto relative mx-auto w-full min-w-0 max-w-3xl rounded-2xl border border-border/75 bg-card/85 p-3 shadow-xl shadow-foreground/[0.02] backdrop-blur-lg mobile:rounded-2xl transition-all duration-300 hover:border-border/95 focus-within:border-primary/45 focus-within:shadow-primary/[0.015]">
        <ConversationActionPicker
          v-model="input"
          v-model:selected-action="selectedAction"
          :actions="availableActions"
        />
        <MessageAttachmentStrip
          v-if="pendingAttachments.length"
          :attachments="pendingAttachments"
          removable
          class="mb-2.5"
          @remove="pendingAttachments.splice($event, 1)"
        />
        <ConversationComposerEditor v-model="input" @submit="send" />
        <div class="mt-2 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/40 pt-2">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <ConversationComposerToolbarTools
              v-model:prompt="input"
              :tool-ids="appearance.composerToolbar.left"
              @attach="requestAttachments()"
              @whiteboard="whiteboardOpen = true"
              @map="branchMapOpen = true"
              @fullscreen="fullscreenInputOpen = true"
            />
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            <ConversationComposerToolbarTools
              v-model:prompt="input"
              :tool-ids="appearance.composerToolbar.right"
              @attach="requestAttachments()"
              @whiteboard="whiteboardOpen = true"
              @map="branchMapOpen = true"
              @fullscreen="fullscreenInputOpen = true"
            />
            <Button
              size="icon"
              class="size-8 rounded-lg shadow-sm"
              title="发送"
              :disabled="!input.trim() || conversation.activeConversationGenerating"
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
            @keydown="onFullscreenKeydown"
          />
        </div>
        <DialogFooter>
          <div class="mr-auto flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              title="附加文件"
              @click="requestAttachments()"
            >
              <Paperclip class="size-4" />
            </Button>
            <ConversationComposerToolbarTools
              v-model:prompt="input"
              :tool-ids="promptOptimizationToolIds"
            />
          </div>
          <Button variant="outline" @click="fullscreenInputOpen = false">取消</Button>
          <Button
            :disabled="!input.trim() || conversation.activeConversationGenerating"
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
