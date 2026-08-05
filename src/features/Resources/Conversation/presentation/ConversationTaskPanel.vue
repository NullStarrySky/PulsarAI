<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { push } from "notivue";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import type { Plugin } from "@/features/Resources/Plugin/domain/plugin-types";
import {
  applyPluginRegexToText,
  collectPluginRegexRules,
} from "@/features/Resources/Plugin/domain/plugin-regex";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ConversationMarkdown from "./ConversationMarkdown.vue";
import GenerationComponentDialog from "./GenerationComponentDialog.vue";
import { useConversationStore } from "../application/conversation-store";
import type {
  Conversation,
  ConversationResourceBinding,
} from "../domain/conversation-types";

const conversation = useConversationStore();
const plugins = usePluginStore();
const pluginItems = () => (plugins as unknown as { plugins: Plugin[] }).plugins;
const layout = useLayoutStore();
const selectedConversationId = ref("");
const selectedPackageId = ref("");
const input = ref("");
const editingTitle = ref(false);
const titleDraft = ref("");

onMounted(() => {
  void Promise.all([conversation.initialize(), plugins.initialize()]);
});

const currentBinding = computed<ConversationResourceBinding | null>(() => {
  const tab = layout.activeTab;
  if (!tab || (tab.resourceType === "builtin" && tab.resourceId === "conversation-new")) {
    return null;
  }
  if (tab.resourceType === "plugin") {
    const plugin = pluginItems().find((item) => item.id === tab.resourceId);
    if (!plugin) return null;
    const resourcePath =
      typeof tab.resourceParams?.projectPath === "string"
        ? tab.resourceParams.projectPath
        : `/plugins/${plugin.id}`;
    return {
      packageId: plugin.packageId ?? undefined,
      pluginId: plugin.id,
      resourceType: "plugin",
      resourceId: plugin.id,
      resourcePath,
      resourceTitle: `${plugin.name} · ${resourcePath.split("/").pop() || "/"}`,
    };
  }
  if (tab.resourceType === "conversation") {
    const item = conversation.conversations.find(
      (candidate) => candidate.id === tab.resourceId,
    );
    if (!item) return null;
    return item.binding ?? {
      packageId: item.packageId,
      resourceType: "conversation",
      resourceId: item.id,
      resourcePath: `/conversations/${item.id}.json`,
      resourceTitle: item.title,
    };
  }
  const resourcePath =
    typeof tab.resourceParams?.projectPath === "string"
      ? tab.resourceParams.projectPath
      : `/${tab.resourceType}/${tab.resourceId}`;
  return {
    packageId: tab.packageId,
    resourceType: tab.resourceType,
    resourceId: tab.resourceId,
    resourcePath,
    resourceTitle: tab.title,
  };
});

const resourcePackage = computed(() =>
  conversation.packages.find(
    (item) => item.id === currentBinding.value?.packageId,
  ),
);
const executionPackage = computed(() =>
  conversation.packages.find((item) => item.id === selectedPackageId.value),
);
const files = computed(() => {
  const binding = currentBinding.value;
  if (!binding) return [];
  return conversation.conversations
    .filter(
      (item) =>
        item.binding?.resourceType === binding.resourceType
        && item.binding.resourceId === binding.resourceId
        && item.binding.resourcePath === binding.resourcePath,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
});
const selectedConversation = computed(() =>
  files.value.find((item) => item.id === selectedConversationId.value) ?? null,
);
const messages = computed(() =>
  conversation
    .containerPathForConversation(selectedConversation.value ?? undefined)
    .filter(
      (container) =>
        container.role !== "system"
        || Boolean(conversation.currentMessage(container)?.content),
    ),
);
const renderingRegexRules = computed(() => {
  const packageItem = conversation.packages.find(
    (item) => item.id === selectedConversation.value?.packageId,
  );
  return collectPluginRegexRules(
    plugins.enabledPluginsForPackage(
      packageItem?.id,
      packageItem?.enabledGlobalPluginIds,
      packageItem?.mainPluginId,
    ),
  ).value;
});

function renderedMessageContent(index: number) {
  const container = messages.value[index];
  if (!container) return "";
  const message = conversation.currentMessage(container);
  if (!message) return "";
  return applyPluginRegexToText(message.content, {
    role: container.role,
    depthFromEnd: messages.value.length - index,
    rules: renderingRegexRules.value,
    rendering: true,
  }).value;
}

watch(
  currentBinding,
  (binding) => {
    selectedPackageId.value =
      binding?.packageId
      || conversation.activePackageId
      || conversation.packages[0]?.id
      || "";
    selectedConversationId.value = "";
  },
  { immediate: true },
);
watch(
  () => [conversation.activePackageId, conversation.packages.length] as const,
  () => {
    if (
      currentBinding.value
      && !conversation.packages.some((item) => item.id === selectedPackageId.value)
    ) {
      selectedPackageId.value =
        currentBinding.value.packageId
        || conversation.activePackageId
        || conversation.packages[0]?.id
        || "";
    }
  },
);
watch(
  files,
  (items) => {
    if (!items.some((item) => item.id === selectedConversationId.value)) {
      selectedConversationId.value = items[0]?.id ?? "";
    }
  },
  { immediate: true },
);

async function createFile() {
  const binding = currentBinding.value;
  if (!binding) {
    push.warning("当前页面没有可绑定的资源。");
    return;
  }
  if (!executionPackage.value) {
    push.warning("请先选择用于运行该会话的角色包。");
    return;
  }
  const kind = binding.resourceType === "plugin" ? "test" : "task";
  const created = await conversation.createConversation(
    executionPackage.value.id,
    {
      activate: false,
      kind,
      binding,
      title: conversation.uniqueConversationTitle(
        executionPackage.value.id,
        `${kind === "test" ? "测试" : "任务"} · ${binding.resourceTitle}`,
      ),
    },
  );
  selectedConversationId.value = created.id;
}

function openConversationFile(item?: Conversation | null) {
  if (!item) return;
  conversation.openConversation(item.id);
  layout.openResourceTab({
    resourceType: "conversation",
    resourceId: item.id,
    packageId: item.packageId,
    title: item.title,
  });
}

function startRename() {
  if (!selectedConversation.value) return;
  titleDraft.value = selectedConversation.value.title;
  editingTitle.value = true;
}

async function saveRename() {
  const item = selectedConversation.value;
  if (!item) return;
  await conversation.updateConversation(item.id, {
    title: titleDraft.value.trim() || item.title,
  });
  editingTitle.value = false;
}

async function deleteFile() {
  const item = selectedConversation.value;
  if (!item) return;
  layout.closeTabsByResource("conversation", item.id);
  await conversation.deleteConversation(item.id, { activateFallback: false });
}

async function send() {
  const item = selectedConversation.value;
  const content = input.value.trim();
  if (!item || !content || conversation.isConversationGenerating(item.id)) return;
  input.value = "";
  await conversation.sendToConversation(item.id, content);
}
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <GenerationComponentDialog />
    <div class="border-b p-2">
      <div class="mb-2 min-w-0 px-1">
        <div class="truncate text-xs font-medium">
          {{ currentBinding?.resourceTitle ?? "任务" }}
        </div>
        <div class="mt-0.5 truncate text-[10px] text-muted-foreground">
          {{ resourcePackage?.name ?? "全局资源" }}
        </div>
      </div>

      <div class="flex items-center gap-1">
        <Input
          v-if="editingTitle"
          v-model="titleDraft"
          class="h-8 min-w-0 flex-1"
          autofocus
          @keydown.enter.prevent="saveRename"
          @keydown.escape.prevent="editingTitle = false"
          @blur="saveRename"
        />
        <DropdownMenu v-else>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" class="h-8 min-w-0 flex-1 justify-between px-2">
              <span class="truncate">
                {{ selectedConversation?.title ?? "选择会话文件" }}
              </span>
              <ChevronDown class="size-3.5 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-64">
            <DropdownMenuLabel>关联会话</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="item in files"
              :key="item.id"
              @click="selectedConversationId = item.id"
            >
              <FileText class="mr-2 size-4" />
              <span class="min-w-0 flex-1 truncate">{{ item.title }}</span>
              <Check v-if="item.id === selectedConversationId" class="ml-2 size-4" />
            </DropdownMenuItem>
            <DropdownMenuItem v-if="files.length === 0" disabled>
              还没有关联会话
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              :disabled="!currentBinding || !executionPackage"
              @click="createFile"
            >
              <Plus class="mr-2 size-4" />
              新建任务会话
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="!selectedConversation" @click="startRename">
              <Pencil class="mr-2 size-4" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem
              :disabled="!selectedConversation"
              @click="openConversationFile(selectedConversation)"
            >
              <ExternalLink class="mr-2 size-4" />
              外部打开
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              :disabled="!selectedConversation"
              class="text-destructive focus:text-destructive"
              @click="deleteFile"
            >
              <Trash2 class="mr-2 size-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu v-if="!resourcePackage">
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="size-8" title="选择执行角色包">
              <span class="max-w-6 truncate text-[10px]">
                {{ executionPackage?.name.slice(0, 2) ?? "包" }}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-52">
            <DropdownMenuLabel>执行角色包</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="item in conversation.packages"
              :key="item.id"
              @click="selectedPackageId = item.id"
            >
              <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
              <Check v-if="item.id === selectedPackageId" class="ml-2 size-4" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

      </div>
    </div>

    <ScrollArea v-if="selectedConversation" class="min-h-0 flex-1">
      <div class="p-3">
        <div
        v-for="(container, index) in messages"
        :key="container.id"
        class="mb-3"
      >
        <div class="mb-1 text-[10px] font-medium text-muted-foreground">
          {{ container.role === "user" ? "你" : container.role === "assistant" ? "助手" : "上下文" }}
        </div>
        <div
          :class="[
            'rounded-md px-2.5 py-2 text-sm leading-5',
            container.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          ]"
        >
          <ConversationMarkdown
            v-if="conversation.currentMessage(container)?.content"
            :model-value="renderedMessageContent(index)"
          />
          <span v-else class="text-xs text-muted-foreground">生成中…</span>
        </div>
        </div>
      </div>
    </ScrollArea>
    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center justify-center px-5 text-center"
    >
      <FileText class="mb-3 size-6 text-muted-foreground" />
      <p class="text-sm font-medium">
        {{ currentBinding ? "为当前资源新建任务" : "当前页面没有任务上下文" }}
      </p>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">
        当前资源、所属包、资源内容和对应系统文档会随关联会话一起进入生成上下文。
      </p>
    </div>

    <div v-if="selectedConversation" class="border-t p-2">
      <ConversationComposerEditor
        v-model="input"
        :enable-ai="false"
        placeholder="围绕当前资源提问…"
        @submit="send"
      />
      <div class="mt-1 flex justify-end">
        <Button
          size="icon"
          class="size-8"
          :disabled="!input.trim() || conversation.isConversationGenerating(selectedConversation.id)"
          @click="send"
        >
          <Send class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
