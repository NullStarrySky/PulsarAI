<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Bot,
  CircleAlert,
  GitFork,
  Search,
  Settings2,
  Star,
  UserRound,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { useConversationStore } from "@/features/Resources/Conversation/store/conversation-store";
import type {
  ChatMessage,
  ChatMessageContainer,
} from "@/features/Resources/Conversation/messages/conversation-types";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  navigate: [containerId: string];
}>();

interface BranchMapNode {
  container: ChatMessageContainer;
  x: number;
  y: number;
  branchIndex: number;
  branchCount: number;
}

interface BranchMapEdge {
  id: string;
  path: string;
  active: boolean;
}

interface BranchMapLayout {
  nodes: BranchMapNode[];
  edges: BranchMapEdge[];
  width: number;
  height: number;
}

interface MessageSearchResult {
  container: ChatMessageContainer;
  message: ChatMessage;
  containerOrder: number;
  messageIndex: number;
}

const nodeWidth = 208;
const nodeHeight = 64;
const columnGap = 48;
const rowGap = 48;
const canvasPadding = 32;

const conversation = useConversationStore();
const navigatingId = ref("");
const searchQuery = ref("");

const activePathIds = computed(
  () => new Set(conversation.activePath.map((container) => container.id)),
);
const currentConversationContainers = computed(() =>
  conversation.containers.filter(
    (container) =>
      container.conversationid === conversation.activeConversationId,
  ),
);
const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);
const searchResults = computed<MessageSearchResult[]>(() => {
  const keyword = normalizedSearchQuery.value;
  if (!keyword) {
    return [];
  }

  return currentConversationContainers.value
    .flatMap((container, containerOrder) =>
      container.content.map((message, messageIndex) => ({
        container,
        message,
        containerOrder,
        messageIndex,
      })),
    )
    .filter(({ message }) =>
      message.content.toLocaleLowerCase().includes(keyword),
    )
    .sort((left, right) =>
      Number(Boolean(right.message.favorite))
      - Number(Boolean(left.message.favorite))
      || left.containerOrder - right.containerOrder
      || left.messageIndex - right.messageIndex,
    );
});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      searchQuery.value = "";
      navigatingId.value = "";
    }
  },
);

const layout = computed<BranchMapLayout>(() => {
  const containers = currentConversationContainers.value;
  if (containers.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: 720,
      height: 320,
    };
  }

  const byId = new Map(containers.map((container) => [container.id, container]));
  const childrenByParent = new Map<string, ChatMessageContainer[]>();
  for (const container of containers) {
    if (!container.previousContainer || !byId.has(container.previousContainer)) {
      continue;
    }
    const children = childrenByParent.get(container.previousContainer) ?? [];
    children.push(container);
    childrenByParent.set(container.previousContainer, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.id.localeCompare(right.id));
  }

  const roots = containers.filter(
    (container) =>
      !container.previousContainer || !byId.has(container.previousContainer),
  );
  const nodes: BranchMapNode[] = [];
  const placed = new Set<string>();
  let nextLane = 0;
  let maximumDepth = 0;

  function place(container: ChatMessageContainer, depth: number): number {
    const existing = nodes.find((node) => node.container.id === container.id);
    if (existing) {
      return (existing.x - canvasPadding) / (nodeWidth + columnGap);
    }

    placed.add(container.id);
    maximumDepth = Math.max(maximumDepth, depth);
    const children = (childrenByParent.get(container.id) ?? []).filter(
      (child) => !placed.has(child.id),
    );
    const childLanes = children.map((child) => place(child, depth + 1));
    const lane = childLanes.length > 0
      ? (childLanes[0] + childLanes[childLanes.length - 1]) / 2
      : nextLane++;
    const siblings = container.previousContainer
      ? childrenByParent.get(container.previousContainer) ?? [container]
      : roots;

    nodes.push({
      container,
      x: canvasPadding + lane * (nodeWidth + columnGap),
      y: canvasPadding + depth * (nodeHeight + rowGap),
      branchIndex: Math.max(0, siblings.findIndex((item) => item.id === container.id)) + 1,
      branchCount: Math.max(siblings.length, 1),
    });
    return lane;
  }

  for (const root of roots) {
    if (!placed.has(root.id)) {
      place(root, 0);
    }
  }
  for (const container of containers) {
    if (!placed.has(container.id)) {
      place(container, 0);
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.container.id, node]));
  const edges = nodes.flatMap((node): BranchMapEdge[] => {
    const parent = node.container.previousContainer
      ? nodeById.get(node.container.previousContainer)
      : null;
    if (!parent) {
      return [];
    }
    const startX = parent.x + nodeWidth / 2;
    const startY = parent.y + nodeHeight;
    const endX = node.x + nodeWidth / 2;
    const endY = node.y;
    const middleY = startY + (endY - startY) / 2;
    return [{
      id: `${parent.container.id}:${node.container.id}`,
      path: `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`,
      active:
        activePathIds.value.has(parent.container.id)
        && activePathIds.value.has(node.container.id),
    }];
  });

  const maximumX = nodes.reduce(
    (current, node) => Math.max(current, node.x),
    canvasPadding,
  );
  return {
    nodes,
    edges,
    width: Math.max(720, maximumX + nodeWidth + canvasPadding),
    height: Math.max(
      320,
      canvasPadding * 2 + (maximumDepth + 1) * nodeHeight + maximumDepth * rowGap,
    ),
  };
});

function messageOf(container: ChatMessageContainer) {
  return conversation.currentMessage(container);
}

function roleLabel(container: ChatMessageContainer) {
  if (container.role === "user") return "用户";
  if (container.role === "system") return "系统";
  return "助手";
}

function messagePreview(container: ChatMessageContainer) {
  return contentPreview(messageOf(container)?.content ?? "");
}

function contentPreview(content: string) {
  const normalized = content
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/[#>*_`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "空消息";
}

function nodeClass(node: BranchMapNode) {
  const active = activePathIds.value.has(node.container.id);
  const current = conversation.activeContainerId === node.container.id;
  const error = messageOf(node.container)?.type === "error";
  return cn(
    "absolute h-16 w-52 justify-start gap-2 overflow-hidden px-3 py-2 text-left shadow-sm",
    active && "border-primary/45 bg-primary/10",
    current && "ring-2 ring-primary ring-offset-2 ring-offset-background",
    error && "border-destructive/50 text-destructive",
  );
}

async function navigateTo(containerId: string, messageId?: string) {
  if (navigatingId.value) {
    return;
  }
  navigatingId.value = messageId
    ? `${containerId}:${messageId}`
    : containerId;
  try {
    const selected = messageId
      ? await conversation.activateMessage(containerId, messageId)
      : await conversation.activateContainerBranch(containerId);
    if (!selected) {
      return;
    }
    emit("update:open", false);
    emit("navigate", selected);
  } finally {
    navigatingId.value = "";
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex h-[min(760px,88vh)] w-[min(1040px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0 mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0">
      <DialogHeader class="border-b px-5 py-4 mobile:px-4">
        <DialogTitle>会话地图</DialogTitle>
        <DialogDescription>
          搜索会覆盖地图并显示消息预览；收藏结果优先。清空搜索后可继续查看无合并分支图。
        </DialogDescription>
        <InputGroup class="mt-2">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            v-model="searchQuery"
            aria-label="搜索当前会话消息"
            placeholder="搜索当前会话消息..."
          />
        </InputGroup>
      </DialogHeader>

      <div
        v-if="normalizedSearchQuery && searchResults.length"
        class="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-3 mobile:p-2"
      >
        <div class="mx-auto flex max-w-3xl flex-col gap-2">
          <Button
            v-for="result in searchResults"
            :key="`${result.container.id}:${result.message.id}`"
            variant="outline"
            class="h-auto w-full items-start justify-start gap-3 px-3 py-3 text-left"
            :disabled="Boolean(navigatingId)"
            :aria-label="`跳转到${roleLabel(result.container)}消息：${contentPreview(result.message.content)}`"
            @click="navigateTo(result.container.id, result.message.id)"
          >
            <CircleAlert
              v-if="result.message.type === 'error'"
              class="mt-0.5 text-destructive"
              data-icon="inline-start"
            />
            <UserRound
              v-else-if="result.container.role === 'user'"
              class="mt-0.5"
              data-icon="inline-start"
            />
            <Settings2
              v-else-if="result.container.role === 'system'"
              class="mt-0.5"
              data-icon="inline-start"
            />
            <Bot v-else class="mt-0.5" data-icon="inline-start" />
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="flex items-center gap-1.5 text-xs font-medium">
                <span>{{ roleLabel(result.container) }}</span>
                <span class="text-muted-foreground">
                  · 版本 {{ result.messageIndex + 1 }}/{{ result.container.content.length }}
                </span>
                <Star
                  v-if="result.message.favorite"
                  class="ml-auto fill-current text-primary"
                />
              </span>
              <span class="line-clamp-3 whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
                {{ contentPreview(result.message.content) }}
              </span>
            </span>
          </Button>
        </div>
      </div>

      <Empty v-else-if="normalizedSearchQuery" class="min-h-0 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyTitle>没有匹配的消息</EmptyTitle>
          <EmptyDescription>换一个关键词，或清空搜索返回会话地图。</EmptyDescription>
        </EmptyHeader>
      </Empty>

      <div v-else-if="layout.nodes.length" class="min-h-0 flex-1 overflow-auto bg-muted/20">
        <div
          class="relative"
          :style="{ width: `${layout.width}px`, height: `${layout.height}px` }"
        >
          <svg
            aria-hidden="true"
            class="pointer-events-none absolute inset-0"
            :width="layout.width"
            :height="layout.height"
          >
            <path
              v-for="edge in layout.edges"
              :key="edge.id"
              :d="edge.path"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="2"
              :class="edge.active ? 'text-primary' : 'text-border'"
            />
          </svg>

          <Button
            v-for="node in layout.nodes"
            :key="node.container.id"
            variant="outline"
            :class="nodeClass(node)"
            :style="{ left: `${node.x}px`, top: `${node.y}px` }"
            :aria-label="`跳转到${roleLabel(node.container)}消息：${messagePreview(node.container)}`"
            :disabled="Boolean(navigatingId)"
            @click="navigateTo(node.container.id)"
          >
            <CircleAlert
              v-if="messageOf(node.container)?.type === 'error'"
              data-icon="inline-start"
            />
            <UserRound
              v-else-if="node.container.role === 'user'"
              data-icon="inline-start"
            />
            <Settings2
              v-else-if="node.container.role === 'system'"
              data-icon="inline-start"
            />
            <Bot v-else data-icon="inline-start" />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate text-xs font-medium">
                {{ roleLabel(node.container) }}
                <template v-if="node.branchCount > 1">
                  · 分支 {{ node.branchIndex }}/{{ node.branchCount }}
                </template>
                <template v-if="node.container.content.length > 1">
                  · {{ node.container.content.length }} 个版本
                </template>
              </span>
              <span class="truncate text-xs font-normal text-muted-foreground">
                {{ messagePreview(node.container) }}
              </span>
            </span>
          </Button>
        </div>
      </div>

      <Empty v-else class="min-h-0 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <GitFork />
          </EmptyMedia>
          <EmptyTitle>还没有可绘制的消息</EmptyTitle>
          <EmptyDescription>发送第一条消息后，这里会显示会话分支。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </DialogContent>
  </Dialog>
</template>
