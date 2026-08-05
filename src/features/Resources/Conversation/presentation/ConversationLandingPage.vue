<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { push } from "notivue";
import {
  Check,
  ChevronDown,
  ListTodo,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  Send,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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

const props = defineProps<{
  packageId?: string;
}>();
const conversation = useConversationStore();
const layout = useLayoutStore();
const appearance = useAppearanceStore();
const input = ref("");
const greeting = ref(createGreeting());
const pendingAttachments = ref<FilePart[]>([]);
const attachmentInput = ref<HTMLInputElement | null>(null);
const fullscreenInputOpen = ref(false);
const whiteboardOpen = ref(false);
const selectedPackageId = ref("");
const createPackageMode = ref(false);
const newPackageName = ref("");
const conversationKind = ref<"chat" | "task">("chat");
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
  if ((!prompt && pendingAttachments.value.length === 0) || starting.value) return;
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
      return;
    }
    const baseTitle =
      conversationKind.value === "task"
        ? `任务 · ${targetPackage.name}`
        : targetPackage.name;
    const title = conversation.uniqueConversationTitle(
      targetPackage.id,
      baseTitle,
    );
    const created = await conversation.createConversation(
      targetPackage.id,
      {
        title,
        kind: conversationKind.value,
        binding:
          conversationKind.value === "task"
            ? {
                packageId: targetPackage.id,
                resourceType: "project",
                resourceId: targetPackage.id,
                resourcePath: "/project.json",
                resourceTitle: targetPackage.name,
              }
            : undefined,
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
</script>

<template>
  <ScrollArea class="min-h-0 flex-1 bg-background">
    <div class="mx-auto flex min-h-full w-full max-w-[800px] flex-col justify-center px-6 py-12 mobile:px-3 mobile:py-6">
      <h1 class="mb-8 text-center text-2xl font-semibold tracking-tight mobile:mb-5 mobile:text-xl">
        {{ greeting }}
      </h1>

      <section class="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div class="flex min-h-11 items-center justify-between gap-2 border-b px-3">
          <Popover v-model:open="projectPopoverOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                class="h-8 min-w-0 max-w-[70%] justify-start gap-2 px-2 font-normal"
              >
                <ResourceAvatar
                  v-if="selectedPackage"
                  :name="selectedPackage.name"
                  :icon="selectedPackage.icon"
                  class="size-5"
                />
                <span class="min-w-0 truncate">
                  {{ createPackageMode ? newPackageName || "新角色包" : selectedPackage?.name ?? "选择角色包" }}
                </span>
                <ChevronDown class="shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" class="w-[min(22rem,calc(100vw-2rem))] p-2">
              <div class="relative mb-2">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input v-model="projectSearch" class="h-8 pl-8" placeholder="搜索角色包" />
              </div>
              <ScrollArea class="h-64">
                <div class="pr-2">
                  <button
                    type="button"
                    class="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
                    @click="chooseNewPackage"
                  >
                    <span class="flex size-6 items-center justify-center rounded bg-muted">
                      <Plus class="text-muted-foreground" />
                    </span>
                    <span class="min-w-0 flex-1 truncate">新建角色包并开始</span>
                    <Check v-if="createPackageMode" />
                  </button>
                  <button
                    v-for="project in filteredProjects"
                    :key="project.id"
                    type="button"
                    class="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    @click="selectPackage(project.id)"
                  >
                    <ResourceAvatar :name="project.name" :icon="project.icon" class="size-6" />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm">{{ project.name }}</span>
                      <span v-if="project.description" class="block truncate text-xs text-muted-foreground">
                        {{ project.description }}
                      </span>
                    </span>
                    <Check v-if="selectedPackageId === project.id" class="shrink-0" />
                  </button>
                  <p v-if="filteredProjects.length === 0" class="px-2 py-6 text-center text-xs text-muted-foreground">
                    没有匹配的角色包
                  </p>
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :model-value="conversationKind"
            aria-label="会话类型"
            @update:model-value="$event && (conversationKind = $event as 'chat' | 'task')"
          >
            <ToggleGroupItem value="chat" aria-label="聊天" title="聊天">
              <MessageSquare />
            </ToggleGroupItem>
            <ToggleGroupItem value="task" aria-label="任务" title="任务">
              <ListTodo />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div v-if="createPackageMode" class="border-b px-3 py-2">
          <Input v-model="newPackageName" class="h-8" placeholder="新角色包名称" />
        </div>

        <div class="px-3 pb-2 pt-3">
          <MessageAttachmentStrip
            v-if="pendingAttachments.length"
            :attachments="pendingAttachments"
            removable
            class="mb-1"
            @remove="pendingAttachments.splice($event, 1)"
          />
          <ConversationComposerEditor v-model="input" :enable-ai="false" placeholder="输入消息..." @submit="startConversation" />
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-1">
              <ConversationComposerToolbarTools
                :tool-ids="appearance.composerToolbar.left"
                @attach="attachmentInput?.click()"
                @whiteboard="whiteboardOpen = true"
                @fullscreen="fullscreenInputOpen = true"
              />
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <ConversationComposerToolbarTools
                :tool-ids="appearance.composerToolbar.right"
                @attach="attachmentInput?.click()"
                @whiteboard="whiteboardOpen = true"
                @fullscreen="fullscreenInputOpen = true"
              />
              <Button
                size="icon"
                class="size-8 mobile:size-10"
                title="发送"
                :disabled="(!input.trim() && pendingAttachments.length === 0) || starting"
                @click="startConversation"
              >
                <Send />
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
        <Button size="icon" variant="ghost" class="mr-auto" title="附加文件" @click="attachmentInput?.click()">
          <Paperclip />
        </Button>
        <Button variant="outline" @click="fullscreenInputOpen = false">取消</Button>
        <Button
          :disabled="(!input.trim() && pendingAttachments.length === 0) || starting"
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
