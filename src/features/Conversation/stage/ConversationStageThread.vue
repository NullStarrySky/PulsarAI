<script setup lang="ts">
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Database,
  GitBranch,
  Languages,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Volume2,
  Star,
  StarOff,
  Trash2,
  WandSparkles,
  ChevronsRight,
} from "lucide-vue-next";
import { computed, reactive, ref, onMounted, onBeforeUnmount } from "vue";
import { push } from "notivue";
import { toBlob } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslateStore } from "@/features/Translate/translate-store";
import { useLayoutStore } from "@/features/UI/layout-store";
import { startWindowDragFromBackground } from "@/features/UI/window-drag";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import type { ActionPart, ChatMessage, ChatMessageContainer, FilePart } from "@/features/Conversation/messages/conversation-types";
import ConversationComposerEditor from "@/features/Conversation/composer/ConversationComposerEditor.vue";
import ConversationMarkdown from "@/features/Conversation/stage/ConversationMarkdown.vue";
import ConversationMessageContent from "@/features/Conversation/stage/ConversationMessageContent.vue";
import type { ConversationMarkdownSelection } from "@/features/Conversation/stage/ConversationMarkdown.vue";
import MessageActionBadge from "@/features/Conversation/stage/MessageActionBadge.vue";
import MessageAttachmentStrip from "@/features/Conversation/stage/MessageAttachmentStrip.vue";
import ThinkingStepsComponent, { type StepRow } from "@/features/Plugin/agent/components/ThinkingStepsComponent.vue";
import { getGenerationComponent } from "@/features/Conversation/generation-components/generation-component-registry";
import { playMessageSpeech } from "@/features/TTS/message-speech-cache";

const conversation = useConversationStore();
const translate = useTranslateStore();
const layout = useLayoutStore();
const editing = reactive({ containerId: "", messageId: "", content: "", minHeight: 0 });
const annotationOpen = ref(false);
const annotationInstruction = ref("");
const annotationTarget = reactive({
  containerId: "",
  messageId: "",
  text: "",
});
const annotationPresets = ["长一点", "短一点", "更正式", "更口语"];
const activePath = computed(() => conversation.activePath.filter((item) =>
  item.role !== "system" || Boolean(messageOf(item)?.content),
));
const latestAssistantId = computed(() =>
  [...activePath.value].reverse().find((item) => !item.hidden && item.role !== "user")?.id ?? "",
);

function messageOf(container: ChatMessageContainer) {
  return conversation.currentMessage(container);
}

function agentSteps(container: ChatMessageContainer) {
  return (messageOf(container)?.meta.steps ?? []).filter(
    (step) =>
      step.type === "thinking"
      || step.type === "tool-call"
      || step.type === "tool-result",
  );
}

function formatStepValue(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  } catch {
    return String(value);
  }
}

function fileParts(message?: ChatMessage | null): FilePart[] {
  return (message?.parts ?? []).filter((part): part is FilePart => part.type === "file");
}

function actionPart(message?: ChatMessage | null) {
  return message?.parts?.find((part): part is ActionPart => part.type === "action") ?? null;
}

function componentParts(message?: ChatMessage | null) {
  return (message?.parts ?? []).filter(
    (part): part is { type: "component"; componentId: string; props?: Record<string, unknown> } =>
      part.type === "component"
  );
}

function mapStepsToRows(steps: ReturnType<typeof agentSteps>): StepRow[] {
  const result: StepRow[] = [];
  const toolCallMap = new Map<string, StepRow>();

  for (const step of steps) {
    if (step.type === "thinking") {
      result.push({ primary: step.message || "思考中…" });
    } else if (step.type === "tool-call") {
      const formattedInput = formatStepValue(step.input);
      const row: StepRow = {
        primary: `工具调用: ${step.toolName}`,
        secondary: formattedInput,
        input: formattedInput,
        mono: true,
      };
      if (step.toolCallId) {
        toolCallMap.set(step.toolCallId, row);
      }
      result.push(row);
    } else if (step.type === "tool-result") {
      const formattedOutput = formatStepValue(step.output);
      const formattedInput = formatStepValue(step.input);
      const existing = step.toolCallId ? toolCallMap.get(step.toolCallId) : null;
      if (existing) {
        existing.output = formattedOutput;
        if (!existing.input) existing.input = formattedInput;
      } else {
        result.push({
          primary: `工具调用: ${step.toolName}`,
          secondary: formattedOutput,
          input: formattedInput,
          output: formattedOutput,
          mono: true,
        });
      }
    }
  }

  return result;
}

function generating(container: ChatMessageContainer) {
  const info = messageOf(container)?.meta.generateInfo;
  return conversation.isConversationGenerating(container.conversationid)
    && info !== undefined
    && info.timeUsed === undefined;
}

function isEditing(container: ChatMessageContainer) {
  return editing.containerId === container.id && editing.messageId === messageOf(container)?.id;
}

function startEdit(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) return;
  const bubbleEl = document.getElementById(`message-bubble-${container.id}`);
  const minHeight = bubbleEl ? Math.round(bubbleEl.getBoundingClientRect().height) : 0;
  Object.assign(editing, {
    containerId: container.id,
    messageId: message.id,
    content: message.content,
    minHeight,
  });
}

async function saveEdit() {
  if (!editing.containerId || !editing.messageId) return;
  await conversation.editMessage(editing.containerId, editing.messageId, editing.content);
  Object.assign(editing, { containerId: "", messageId: "", content: "", minHeight: 0 });
}

async function copy(container: ChatMessageContainer) {
  const content = messageOf(container)?.content;
  if (!content) return;
  await navigator.clipboard.writeText(content);
  push.success("已复制");
}

async function speakMessage(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message?.content.trim()) return;
  try {
    await playMessageSpeech(message.id, message.content);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "朗读失败");
  }
}

function openAnnotationDialog(
  container: ChatMessageContainer,
  selection: ConversationMarkdownSelection,
) {
  const message = messageOf(container);
  if (!message) return;
  Object.assign(annotationTarget, {
    containerId: container.id,
    messageId: message.id,
    text: selection.text,
  });
  annotationInstruction.value = "";
  annotationOpen.value = true;
}

function closeAnnotationDialog() {
  annotationOpen.value = false;
  annotationInstruction.value = "";
  Object.assign(annotationTarget, {
    containerId: "",
    messageId: "",
    text: "",
  });
}

async function saveAnnotation(instruction = annotationInstruction.value) {
  const saved = await conversation.annotateMessage(
    annotationTarget.containerId,
    annotationTarget.messageId,
    annotationTarget.text,
    instruction,
  );
  if (!saved) {
    push.error("标注无效，消息可能已经切换版本。");
    return;
  }
  closeAnnotationDialog();
  push.success("已添加重写标注");
}

async function rewriteMessage(container: ChatMessageContainer) {
  const rewritten = await conversation.requestContainer({ mode: "rewrite", containerId: container.id });
  if (!rewritten) {
    push.error("当前消息无法重写。");
  }
}

async function continueMessage(container: ChatMessageContainer) {
  const continued = await conversation.requestContainer({ mode: "continue", containerId: container.id });
  if (!continued) push.error("当前消息无法继续。");
}

async function exportScreenshot(container: ChatMessageContainer) {
  const el = document.getElementById(`message-bubble-${container.id}`);
  if (!el) {
    push.error("未找到消息元素");
    return;
  }
  try {
    const blob = await toBlob(el, {
      cacheBust: true,
      pixelRatio: 2,
      style: {
        borderRadius: "16px",
      },
    });
    if (!blob) {
      throw new Error("生成截图失败");
    }
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type || "image/png"]: blob }),
    ]);
    push.success("截图已复制到剪切板");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "截图导出失败");
  }
}

async function toggleFavorite(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) return;
  await conversation.setMessageFavorite(container.id, message.id, !message.favorite);
}

async function translateMessage(container: ChatMessageContainer) {
  const message = messageOf(container);
  if (!message) return;
  if (message.meta.translation) {
    await conversation.restoreMessageOriginal(container.id, message.id);
    return;
  }
  if (!message.content.trim() || translate.translating) return;
  try {
    const translated = await translate.translateText(message.content, true);
    await conversation.setMessageTranslation(container.id, message.id, translated);
  } catch {
    push.error(translate.errorText || "翻译失败");
  }
}

async function switchMessage(container: ChatMessageContainer, direction: -1 | 1) {
  const active = container.activeMessage ?? 0;
  const next = active + direction;
  if (next >= container.content.length) {
    await conversation.requestContainer({ mode: "regenerate", containerId: container.id });
    return;
  }
  await conversation.switchMessage(container.id, Math.max(0, next));
}

function messageTime(container: ChatMessageContainer) {
  const message = messageOf(container);
  const value = message?.createdAt ?? message?.meta.generateInfo?.startTime;
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isInputFocused(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  const tagName = active.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if ((active as HTMLElement).isContentEditable) {
    return true;
  }
  if (active.closest('input, textarea, select, [contenteditable="true"], .ProseMirror')) {
    return true;
  }
  return false;
}

function handleHotkeyKeydown(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (isInputFocused()) return;

  const lastContainer = [...activePath.value].reverse().find(
    (item) => !item.hidden && item.role !== "system",
  );
  if (!lastContainer) return;

  const active = lastContainer.activeMessage ?? 0;
  if (event.key === "ArrowLeft" && active > 0) {
    event.preventDefault();
    void switchMessage(lastContainer, -1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    void switchMessage(lastContainer, 1);
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleHotkeyKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleHotkeyKeydown);
});

function dragImmersiveConversationBackground(event: MouseEvent) {
  if (!layout.immersiveConversation) return;
  void startWindowDragFromBackground(event);
}
</script>

<template>
  <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <MessageScroller class="absolute inset-0 min-h-0 min-w-0" @mousedown="dragImmersiveConversationBackground">
      <MessageScrollerViewport>
        <MessageScrollerContent class="gap-0">
          <div class="grid min-h-full w-full grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
            <div aria-hidden="true" class="mobile:hidden" />
            <div class="flex min-h-full min-w-0 flex-col justify-end px-4 pb-48 pt-5 mobile:px-3 mobile:pb-44">
              <div v-if="activePath.length" class="flex flex-col gap-4">
                <template
                  v-for="(container, floorIndex) in activePath"
                  :key="container.id"
                >
                  <MessageScrollerItem
                    v-if="!container.hidden"
                    :message-id="container.id"
                    :scroll-anchor="container.role === 'user'"
                  >
                  <Message :align="container.role === 'user' ? 'end' : 'start'" class="flex-col gap-1 data-[align=end]:flex-col">
                    <MessageContent :class="container.role === 'user' ? 'max-w-[77%] items-end self-end mobile:max-w-[88%]' : 'w-full items-start'">
                      <ThinkingStepsComponent
                        v-if="agentSteps(container).length"
                        :variant="container.role === 'assistant' ? 'Steps' : 'Coding'"
                        :working="generating(container)"
                        :has-main-text="Boolean(messageOf(container)?.content.trim())"
                        :done-text="`Agent 过程（${agentSteps(container).length}）`"
                        :rows="mapStepsToRows(agentSteps(container))"
                        class="mb-2"
                      />

                      <Bubble
                        :id="'message-bubble-' + container.id"
                        data-window-drag-block
                        :align="container.role === 'user' ? 'end' : 'start'"
                        :variant="container.role === 'user' ? 'tinted' : 'ghost'"
                        :class="messageOf(container)?.type === 'error' ? 'w-full border border-destructive/30 bg-destructive/10 text-destructive' : container.role === 'user' ? 'max-w-full' : 'w-full p-0'"
                      >
                        <BubbleContent :class="container.role === 'user' ? 'rounded-2xl' : 'w-full bg-transparent p-0'">
                          <Marker v-if="messageOf(container)?.type === 'error'" class="mb-1 text-destructive">
                            <MarkerIcon><CircleAlert /></MarkerIcon>
                            <MarkerContent>运行错误</MarkerContent>
                          </Marker>
                          <MessageActionBadge v-if="actionPart(messageOf(container))" :action="actionPart(messageOf(container))!" class="mb-2" />
                          <MessageAttachmentStrip v-if="fileParts(messageOf(container)).length" :attachments="fileParts(messageOf(container))" class="mb-2" />
                          <template v-for="part in componentParts(messageOf(container))" :key="part.componentId">
                            <component
                              :is="getGenerationComponent(part.componentId)"
                              v-bind="part.props"
                              class="mb-2"
                            />
                          </template>
                          <ConversationComposerEditor
                            v-if="isEditing(container)"
                            v-model="editing.content"
                            compact
                            inline-message-edit
                            class="message-inline-editor w-full"
                            :style="editing.minHeight ? { minHeight: editing.minHeight + 'px' } : undefined"
                            @submit="saveEdit"
                          />
                          <ConversationMarkdown
                            v-else-if="messageOf(container)?.type === 'error'"
                            :model-value="messageOf(container)?.content || '生成失败'"
                            :plugin-id="messageOf(container)?.meta.environmentInfo?.pluginId"
                          />
                          <ConversationMessageContent
                            v-else
                            :content="messageOf(container)?.content || (generating(container) ? '生成中…' : '')"
                            :plugin-id="messageOf(container)?.meta.environmentInfo?.pluginId"
                            @annotate="openAnnotationDialog(container, $event)"
                          />
                        </BubbleContent>
                      </Bubble>

                      <MessageFooter
                        data-window-drag-block
                        class="mt-1 flex h-7 w-full justify-between gap-2 px-0 transition-opacity"
                        :class="[
                          container.id === latestAssistantId ? 'opacity-100' : 'opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 mobile:opacity-100',
                        ]"
                      >
                        <div class="flex min-w-0 items-center gap-0.5">
                          <Button variant="ghost" size="icon-sm" class="rounded-full" title="上一个版本" @click="switchMessage(container, -1)"><ChevronLeft /></Button>
                          <span class="px-1 text-xs">{{ (container.activeMessage ?? 0) + 1 }}/{{ Math.max(container.content.length, 1) }}</span>
                          <Button variant="ghost" size="icon-sm" class="rounded-full" title="下一个版本" @click="switchMessage(container, 1)"><ChevronRight /></Button>
                          <Button v-if="isEditing(container)" variant="ghost" size="icon-sm" class="rounded-full" title="保存" @click="saveEdit"><Check /></Button>
                          <Button v-else variant="ghost" size="icon-sm" class="rounded-full" title="编辑" @click="startEdit(container)"><Pencil /></Button>
                          <Button variant="ghost" size="icon-sm" class="rounded-full" title="复制" @click="copy(container)"><Copy /></Button>
                          <Button v-if="container.role === 'assistant' && !container.hidden" variant="ghost" size="icon-sm" class="rounded-full" title="重新生成" @click="conversation.requestContainer({ mode: 'regenerate', containerId: container.id })"><RefreshCw /></Button>
                          <Popover v-if="container.role !== 'user'">
                            <PopoverTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full" title="分支"><GitBranch /></Button></PopoverTrigger>
                            <PopoverContent class="w-56 p-2">
                              <Button variant="outline" size="sm" class="mb-2 w-full" @click="conversation.createBranch(container.id)"><Plus />新分支</Button>
                              <div class="grid grid-cols-5 gap-1">
                                <Button v-for="(branchId, index) in conversation.branchIdsFor(container.id)" :key="branchId" size="icon-sm" :variant="conversation.activeBranchIdFor(container.id) === branchId ? 'default' : 'ghost'" @click="conversation.switchBranch(container.id, branchId)">{{ index + 1 }}</Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <DropdownMenu>
                            <DropdownMenuTrigger as-child><Button variant="ghost" size="icon-sm" class="rounded-full"><MoreHorizontal /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem @click="speakMessage(container)"><Volume2 data-icon="inline-start" />朗读</DropdownMenuItem>
                              <DropdownMenuItem v-if="container.role === 'assistant' && !container.hidden" @click="rewriteMessage(container)"><WandSparkles data-icon="inline-start" />按标注重写</DropdownMenuItem>
                              <DropdownMenuItem v-if="container.role === 'assistant' && !container.hidden" @click="continueMessage(container)"><ChevronsRight data-icon="inline-start" />继续</DropdownMenuItem>
                              <DropdownMenuItem @click="exportScreenshot(container)"><Camera data-icon="inline-start" />截图并导出</DropdownMenuItem>
                              <DropdownMenuItem @click="toggleFavorite(container)"><StarOff v-if="messageOf(container)?.favorite" data-icon="inline-start" /><Star v-else data-icon="inline-start" />{{ messageOf(container)?.favorite ? "取消收藏" : "收藏" }}</DropdownMenuItem>
                              <DropdownMenuItem v-if="container.role !== 'user'" @click="translateMessage(container)"><RotateCcw v-if="messageOf(container)?.meta.translation" data-icon="inline-start" /><Languages v-else data-icon="inline-start" />{{ messageOf(container)?.meta.translation ? "还原原文" : "翻译" }}</DropdownMenuItem>
                              <DropdownMenuItem class="text-destructive focus:text-destructive" @click="conversation.deleteContainer(container.id)"><Trash2 data-icon="inline-start" />删除消息</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div class="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <Popover v-if="messageOf(container)?.meta.resourceUpdate?.operations?.length">
                            <PopoverTrigger as-child>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                class="h-6 px-1.5 gap-1 rounded-full text-[11px] text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                title="查看资源更新记录"
                              >
                                <Database class="w-3 h-3" />
                                <span>资源更新</span>
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" class="w-[min(28rem,calc(100vw-1rem))] p-3 space-y-2 font-mono text-xs" data-window-drag-block>
                              <div class="flex items-center justify-between border-b pb-1.5">
                                <div class="flex items-center gap-1.5 font-semibold text-amber-500">
                                  <Database class="w-4 h-4" />
                                  <span>消息资源 Overlay 更新</span>
                                </div>
                                <span class="text-[10px] text-muted-foreground">{{ messageOf(container)?.meta.resourceUpdate?.operations?.length }} 条操作</span>
                              </div>

                              <div class="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                <div
                                  v-for="(operation, operationIndex) in messageOf(container)?.meta.resourceUpdate?.operations"
                                  :key="operationIndex"
                                  class="rounded bg-muted/60 p-2 border text-[11px] font-mono leading-snug whitespace-pre-wrap break-all"
                                >
                                  <div class="text-[10px] text-muted-foreground mb-1 select-none">// {{ operation.type }} #{{ operationIndex + 1 }}</div>
                                  <pre class="whitespace-pre-wrap break-words">{{ formatStepValue(operation) }}</pre>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>

                          <span class="tabular-nums">{{ messageTime(container) }}</span>
                          <span class="tabular-nums">#{{ floorIndex + 1 }}</span>
                        </div>
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                  </MessageScrollerItem>
                  <details
                    v-else
                    data-window-drag-block
                    class="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs"
                  >
                    <summary class="cursor-pointer font-medium text-muted-foreground">
                      命令 /{{ container.command?.name || 'process' }}
                      <span v-if="generating(container)">（运行中）</span>
                    </summary>
                    <div class="mt-3 grid gap-3">
                      <pre v-if="container.draft" class="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/80 p-2 font-mono text-[11px]">{{ container.draft }}</pre>
                      <ConversationMessageContent
                        :content="messageOf(container)?.content || (generating(container) ? '生成中…' : '')"
                        :plugin-id="messageOf(container)?.meta.environmentInfo?.pluginId"
                        compact
                      />
                    </div>
                  </details>
                </template>
              </div>

              <div v-else class="flex min-h-72 flex-1 flex-col items-center justify-center text-center">
                <div class="flex size-14 items-center justify-center rounded-2xl bg-muted text-xl font-semibold text-muted-foreground">{{ conversation.activePackage?.name.slice(0, 1) ?? "P" }}</div>
                <h1 class="mt-4 text-lg font-medium">和 {{ conversation.activePackage?.name ?? "Pulsar" }} 开始新的会话</h1>
                <p class="mt-1 max-w-sm text-sm text-muted-foreground">{{ conversation.activePackage?.description || "输入一条消息开始。" }}</p>
              </div>
            </div>
            <div aria-hidden="true" class="mobile:hidden" />
          </div>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton direction="end" />
    </MessageScroller>
    <Dialog :open="annotationOpen" @update:open="(open) => open || closeAnnotationDialog()">
      <DialogContent class="w-[min(34rem,calc(100vw-2rem))] max-w-none">
        <DialogHeader>
          <DialogTitle>添加重写标注</DialogTitle>
          <DialogDescription>标注会直接写入当前消息正文，并在渲染时高亮显示。</DialogDescription>
        </DialogHeader>
        <blockquote class="max-h-32 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {{ annotationTarget.text }}
        </blockquote>
        <div class="flex flex-wrap gap-2">
          <Button v-for="preset in annotationPresets" :key="preset" size="sm" variant="secondary" @click="saveAnnotation(preset)">{{ preset }}</Button>
        </div>
        <Input v-model="annotationInstruction" placeholder="或输入自定义要求，例如：增加一个具体例子" @keydown.enter.prevent="saveAnnotation()" />
        <DialogFooter>
          <Button variant="ghost" @click="closeAnnotationDialog">取消</Button>
          <Button :disabled="!annotationInstruction.trim()" @click="saveAnnotation()">保存标注</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </MessageScrollerProvider>
</template>
