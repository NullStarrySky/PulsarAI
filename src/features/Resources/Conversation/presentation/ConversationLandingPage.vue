<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { push } from "notivue";
import {
  Check,
  ChevronDown,
  Code2,
  Languages,
  Lightbulb,
  Paperclip,
  Plus,
  Search,
  Send,
  Shuffle,
  Sparkles,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ConversationComposerToolbarTools from "./ConversationComposerToolbarTools.vue";
import MessageAttachmentStrip from "./MessageAttachmentStrip.vue";
import ResourceAvatar from "./ResourceAvatar.vue";
import { fileToMessagePart } from "@/features/Resources/Conversation/application/message-attachment";
import type { FilePart } from "@/features/Resources/Conversation/domain/conversation-types";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import type { ComposerToolId } from "@/features/UI/domain/composer-toolbar";
import type { WorkspaceTab } from "@/features/UI/application/layout-store";

const props = defineProps<{
  packageId?: string;
  resourceId?: string;
  tab?: WorkspaceTab;
}>();
const conversation = useConversationStore();
const layout = useLayoutStore();
const appearance = useAppearanceStore();
const input = ref("");
const greeting = ref(createGreeting());
const promptOptimizationToolIds = computed<ComposerToolId[]>(() =>
  appearance.composerToolbar.unused.includes("optimize") ? [] : ["optimize"],
);
const pendingAttachments = ref<FilePart[]>([]);
const attachmentInput = ref<HTMLInputElement | null>(null);
const fullscreenInputOpen = ref(false);
const whiteboardOpen = ref(false);
const selectedPackageId = ref("");
const createPackageMode = ref(false);
const newPackageName = ref("");
const projectPopoverOpen = ref(false);
const projectSearch = ref("");
const starting = ref(false);

const packages = computed(() =>
  [...conversation.packages]
    .sort(
      (a, b) =>
        b.conversations.length - a.conversations.length
        || a.name.localeCompare(b.name, "zh-Hans"),
    ),
);
const filteredProjects = computed(() => {
  const keyword = projectSearch.value.trim().toLocaleLowerCase();
  return packages.value.filter(
    (item) =>
      !keyword
      || item.name.toLocaleLowerCase().includes(keyword)
      || item.description?.toLocaleLowerCase().includes(keyword),
  );
});
const selectedPackage = computed(() =>
  packages.value.find((item) => item.id === selectedPackageId.value),
);

onMounted(async () => {
  try {
    await conversation.initialize();
  } catch (error) {
    push.error(
      error instanceof Error
        ? error.message
        : String(error || "无法加载角色包数据。"),
    );
  } finally {
    syncSelectedPackage(props.packageId);
  }
});

watch(
  () => props.packageId,
  (packageId) => {
    if (conversation.loaded) syncSelectedPackage(packageId);
  },
);

function syncSelectedPackage(packageId?: string) {
  const targetId = packageId && conversation.packages.some((item) => item.id === packageId)
    ? packageId
    : conversation.packages.some((item) => item.id === conversation.activePackageId)
      ? conversation.activePackageId
      : "";
  selectedPackageId.value = targetId;
  createPackageMode.value = false;
  projectPopoverOpen.value = false;
  projectSearch.value = "";
}

async function selectPackage(packageId: string) {
  if (!packageId) return;
  await conversation.openPackage(packageId);
  layout.openResourceTab({
    resourceType: "builtin",
    resourceId: "conversation-new",
    packageId,
    title: "新建对话",
  });
  selectedPackageId.value = packageId;
  createPackageMode.value = false;
  projectPopoverOpen.value = false;
  projectSearch.value = "";
}

function chooseNewPackage() {
  selectedPackageId.value = "";
  createPackageMode.value = true;
  projectPopoverOpen.value = false;
}

async function startConversation() {
  const prompt = input.value.trim();
  if (!prompt || starting.value) return;
  starting.value = true;
  try {
    await conversation.initialize();
    let targetPackage = selectedPackage.value;
    if (createPackageMode.value) {
      targetPackage = await conversation.createPackage(
        { name: newPackageName.value.trim() || "新角色包" },
        { activate: false },
      );
    }
    if (!targetPackage) {
      push.warning("请先选择角色包，或新建一个角色包。");
      starting.value = false; // reset flag
      return;
    }
    const baseTitle = targetPackage.name;
    const title = conversation.uniqueConversationTitle(
      targetPackage.id,
      baseTitle,
    );
    const created = await conversation.createConversation(
      targetPackage.id,
      {
        title,
        kind: "chat",
      },
    );
    layout.closeTabsByResource("builtin", "conversation-new");
    layout.openResourceTab({
      resourceType: "conversation",
      resourceId: created.id,
      packageId: targetPackage.id,
      title: created.title,
    });
    const attachments = [...pendingAttachments.value];
    input.value = "";
    pendingAttachments.value = [];
    await nextTick();
    await conversation.send(prompt, undefined, attachments);
  } catch (error) {
    push.error(
      error instanceof Error ? error.message : String(error || "无法新建对话。"),
    );
  } finally {
    starting.value = false;
  }
}

async function onAttachmentsSelected(event: Event) {
  const element = event.target as HTMLInputElement;
  const files = Array.from(element.files ?? []);
  element.value = "";
  if (!files.length) return;
  try {
    pendingAttachments.value.push(...await Promise.all(files.map(fileToMessagePart)));
  } catch (error) {
    push.error(error instanceof Error ? error.message : "读取附件失败");
  }
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
  void startConversation();
}

function createGreeting() {
  const hour = new Date().getHours();
  const greetings = hour < 5
    ? ["夜深了，还想聊点什么？", "还没休息吗？我在这里。", "安静的夜里，想从哪里开始？"]
    : hour < 11
      ? ["早上好，今天想聊点什么？", "新的一天，从哪里开始？", "早安，有什么想一起完成的？"]
      : hour < 14
        ? ["中午好，现在想聊点什么？", "午间好，有什么新想法？", "中午好，今天过得怎么样？"]
        : hour < 18
          ? ["下午好，想从哪里开始？", "下午好，有什么可以一起完成？", "今天还顺利吗？"]
          : ["晚上好，今天想聊点什么？", "辛苦一天了，想聊聊什么？", "晚上好，有什么想一起梳理的？"];
  return greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0]!;
}

const suggestionCards = [
  {
    title: "创意写作",
    description: "构思故事、撰写诗歌，或者润色小说情节。",
    prompt: "为我构思一个关于时间旅行的短篇小说大纲",
    icon: Sparkles
  },
  {
    title: "代码助手",
    description: "分析算法、重构代码，或者解释复杂的设计模式。",
    prompt: "帮我用 TypeScript 写一个高效的 LRU 缓存，并添加详细注释",
    icon: Code2
  },
  {
    title: "翻译与精修",
    description: "流畅、地道地进行多语言互译或文案润色。",
    prompt: "帮我将以下段落翻译成地道的英文，并给出词汇替换建议：\n",
    icon: Languages
  },
  {
    title: "头脑风暴",
    description: "寻找创意灵感、探讨学习计划，或生成商业方案。",
    prompt: "我正在规划一个独立的 LLM 开发者工具，帮我进行功能和商业模式头脑风暴",
    icon: Lightbulb
  }
];

function applySuggestion(prompt: string) {
  input.value = prompt;
  void startConversation();
}

function selectRandomPackage() {
  if (packages.value.length === 0) return;
  const index = Math.floor(Math.random() * packages.value.length);
  const randomPackage = packages.value[index];
  if (randomPackage) {
    void selectPackage(randomPackage.id);
  }
}
</script>

<template>
  <ScrollArea class="min-h-0 flex-1 bg-background [&_[data-slot=scroll-area-viewport]>div]:min-h-full">
    <div class="mx-auto flex min-h-full w-full max-w-[800px] flex-col justify-between px-6 py-12 mobile:px-3 mobile:py-6 animate-in fade-in duration-300">

      <!-- Top / Center section -->
      <div class="flex flex-col items-center justify-center flex-1 mb-8 pt-12">
        <h1 class="mb-12 text-center text-3xl font-semibold tracking-tight mobile:mb-8 mobile:text-2xl text-foreground/90">
          {{ greeting }}
        </h1>

        <!-- Predefined suggestion cards grid -->
        <div class="grid grid-cols-2 gap-3 w-full mobile:grid-cols-1">
          <button
            v-for="card in suggestionCards"
            :key="card.title"
            type="button"
            class="flex flex-col text-left p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/40 hover:border-primary/20 transition-all duration-300 group shadow-sm hover:shadow-md"
            @click="applySuggestion(card.prompt)"
          >
            <div class="flex items-center gap-2 mb-1.5">
              <div class="p-1.5 rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                <component :is="card.icon" class="size-4" />
              </div>
              <span class="text-xs font-semibold text-foreground/80">{{ card.title }}</span>
            </div>
            <p class="text-[10px] text-muted-foreground leading-relaxed">{{ card.description }}</p>
          </button>
        </div>
      </div>

      <!-- Bottom section (composer input box) -->
      <section class="min-w-0 overflow-hidden rounded-xl border bg-card shadow-lg shadow-foreground/[0.015] border-border/60">
        <div class="flex min-h-11 items-center gap-2 px-3 border-b bg-muted/5">
          <!-- Narrow character selector (max width w-48) -->
          <Popover v-model:open="projectPopoverOpen">
            <PopoverTrigger as-child>
              <Button
                variant="outline"
                class="h-7 w-48 justify-between gap-1.5 px-2.5 font-normal text-xs rounded-lg hover:bg-muted/80 shrink-0"
              >
                <div class="flex items-center gap-1.5 min-w-0">
                  <ResourceAvatar
                    v-if="selectedPackage"
                    :name="selectedPackage.name"
                    :icon="selectedPackage.icon"
                    class="size-4.5"
                  />
                  <span class="min-w-0 truncate">
                    {{ createPackageMode ? newPackageName || "新角色包" : selectedPackage?.name ?? "选择角色包" }}
                  </span>
                </div>
                <ChevronDown class="size-3 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" class="w-[min(22rem,calc(100vw-2rem))] p-2 rounded-xl border shadow-md">
              <div class="relative mb-2">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground size-3.5" />
                <Input v-model="projectSearch" class="h-8 pl-8 text-xs rounded-lg" placeholder="搜索角色包" />
              </div>
              <ScrollArea class="h-64">
                <div class="pr-2">
                  <button
                    type="button"
                    class="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-accent"
                    @click="chooseNewPackage"
                  >
                    <span class="flex size-6 items-center justify-center rounded bg-muted">
                      <Plus class="size-3.5 text-muted-foreground" />
                    </span>
                    <span class="min-w-0 flex-1 truncate">新建角色包并开始</span>
                    <Check v-if="createPackageMode" class="size-3.5" />
                  </button>
                  <button
                    v-for="project in filteredProjects"
                    :key="project.id"
                    type="button"
                    class="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    @click="selectPackage(project.id)"
                  >
                    <ResourceAvatar :name="project.name" :icon="project.icon" class="size-5.5" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-xs">{{ project.name }}</span>
                      <span v-if="project.description" class="block truncate text-[10px] text-muted-foreground">
                        {{ project.description }}
                      </span>
                    </span>
                    <Check v-if="selectedPackageId === project.id" class="shrink-0 size-3.5" />
                  </button>
                  <p v-if="filteredProjects.length === 0" class="px-2 py-6 text-center text-xs text-muted-foreground">
                    没有匹配的角色包
                  </p>
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <!-- "Random" select button -->
          <Button
            variant="ghost"
            size="icon"
            class="size-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
            title="随机选择角色包"
            @click="selectRandomPackage"
          >
            <Shuffle class="size-3.5" />
          </Button>
        </div>

        <div v-if="createPackageMode" class="border-b px-3 py-2 bg-muted/5">
          <Input v-model="newPackageName" class="h-8 text-xs rounded-lg" placeholder="新角色包名称" />
        </div>

        <div class="min-w-0 px-3 pb-2 pt-3">
          <MessageAttachmentStrip
             v-if="pendingAttachments.length"
             :attachments="pendingAttachments"
             removable
             class="mb-1"
             @remove="pendingAttachments.splice($event, 1)"
          />
          <ConversationComposerEditor v-model="input" :enable-ai="false" placeholder="输入消息..." @submit="startConversation" />
          <div class="flex min-w-0 flex-wrap items-center gap-2 mt-2">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <ConversationComposerToolbarTools
                v-model:prompt="input"
                :tool-ids="appearance.composerToolbar.left"
                @attach="attachmentInput?.click()"
                @whiteboard="whiteboardOpen = true"
                @fullscreen="fullscreenInputOpen = true"
              />
            </div>
            <div class="ml-auto flex shrink-0 items-center gap-1">
              <ConversationComposerToolbarTools
                v-model:prompt="input"
                :tool-ids="appearance.composerToolbar.right"
                @attach="attachmentInput?.click()"
                @whiteboard="whiteboardOpen = true"
                @fullscreen="fullscreenInputOpen = true"
              />
              <Button
                size="icon"
                class="size-8 rounded-lg shadow-sm hover:shadow-md"
                title="发送"
                :disabled="!input.trim() || starting"
                @click="startConversation"
              >
                <Send class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </ScrollArea>

  <input ref="attachmentInput" class="hidden" type="file" multiple @change="onAttachmentsSelected" />

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
      <Textarea
        v-model="input"
        class="min-h-[46vh] resize-none"
        placeholder="输入消息..."
        @keydown="onFullscreenKeydown"
      />
      <DialogFooter>
        <div class="mr-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" title="附加文件" @click="attachmentInput?.click()">
            <Paperclip />
          </Button>
          <ConversationComposerToolbarTools
            v-model:prompt="input"
            :tool-ids="promptOptimizationToolIds"
          />
        </div>
        <Button variant="outline" @click="fullscreenInputOpen = false">取消</Button>
        <Button
          :disabled="!input.trim() || starting"
          @click="fullscreenInputOpen = false; startConversation()"
        >
          <Send data-icon="inline-start" />
          发送
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="whiteboardOpen">
    <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0">
      <DialogTitle class="sr-only">白板</DialogTitle>
      <iframe
        class="h-full w-full border-0 bg-background"
        src="https://excalidraw.com/"
        title="Excalidraw 白板"
        allow="clipboard-read; clipboard-write"
      />
    </DialogContent>
  </Dialog>
</template>
