<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BookOpen, ChevronLeft, ChevronRight, MessageSquareQuote } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  ActionPart,
  ChatMessageContainer,
  ComponentPart,
} from "@/features/Resources/Conversation/domain/conversation-types";
import ConversationMarkdown from "@/features/Resources/Conversation/presentation/ConversationMarkdown.vue";
import MessageActionBadge from "@/features/Resources/Conversation/presentation/MessageActionBadge.vue";
import { getGenerationComponent } from "@/features/Resources/Conversation/presentation/generation-component-registry";

const props = defineProps<{
  conversationId: string;
  containers: ChatMessageContainer[];
  generating: boolean;
  activeContainerId: string;
}>();

const selectedChapter = ref("0");

function messageOf(container?: ChatMessageContainer | null) {
  if (!container || container.activeMessage === null) {
    return null;
  }
  return container.content[container.activeMessage] ?? null;
}

function componentParts(container?: ChatMessageContainer | null): ComponentPart[] {
  return (messageOf(container)?.parts ?? []).filter(
    (part): part is ComponentPart => part.type === "component",
  );
}

function actionPart(container?: ChatMessageContainer | null) {
  return messageOf(container)?.parts?.find(
    (part): part is ActionPart => part.type === "action",
  ) ?? null;
}

const chapters = computed(() => props.containers.flatMap((container, index) => {
  if (container.role !== "assistant") {
    return [];
  }

  let prompt: ChatMessageContainer | null = null;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = props.containers[cursor];
    if (candidate?.role === "user") {
      prompt = candidate;
      break;
    }
    if (candidate?.role === "assistant") {
      break;
    }
  }

  return [{
    container,
    prompt,
    number: index + 1,
  }];
}));

const selectedIndex = computed(() => {
  const parsed = Number(selectedChapter.value);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 0, 0), Math.max(chapters.value.length - 1, 0));
});
const activeChapter = computed(() => chapters.value[selectedIndex.value] ?? null);

function goToChapter(index: number) {
  selectedChapter.value = String(
    Math.min(Math.max(index, 0), Math.max(chapters.value.length - 1, 0)),
  );
}

watch(
  () => props.conversationId,
  () => goToChapter(chapters.value.length - 1),
  { immediate: true },
);

watch(
  () => chapters.value.length,
  (next, previous) => {
    if (next > previous || Number(selectedChapter.value) >= next) {
      goToChapter(next - 1);
    }
  },
);
</script>

<template>
  <section class="relative min-h-0 flex-1 overflow-y-auto bg-background/72 px-5 pb-28 pt-8 backdrop-blur-[2px] mobile:px-3 mobile:pb-32 mobile:pt-4">
    <div v-if="!activeChapter" class="flex min-h-[46vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <BookOpen class="size-7 opacity-60" />
      <p class="text-sm">模型的下一次回复会成为第一章。</p>
    </div>

    <div v-else class="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center">
      <header class="sticky top-0 z-10 mb-8 flex w-full items-center justify-center gap-2 bg-background/75 py-2 backdrop-blur-md mobile:mb-5">
        <Button
          size="icon"
          variant="ghost"
          class="size-8"
          title="上一章"
          :disabled="selectedIndex === 0"
          @click="goToChapter(selectedIndex - 1)"
        >
          <ChevronLeft class="size-4" />
        </Button>
        <Select v-model="selectedChapter">
          <SelectTrigger class="h-8 w-40 justify-center border-0 bg-transparent shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="(chapter, index) in chapters"
              :key="chapter.container.id"
              :value="String(index)"
            >
              第 {{ index + 1 }} 章
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          class="size-8"
          title="下一章"
          :disabled="selectedIndex >= chapters.length - 1"
          @click="goToChapter(selectedIndex + 1)"
        >
          <ChevronRight class="size-4" />
        </Button>
      </header>

      <article class="novel-reader w-full text-center">
        <div class="mb-8 flex flex-col items-center gap-3 mobile:mb-6">
          <BookOpen class="size-5 text-muted-foreground" />
          <p class="text-xs font-medium tracking-[0.28em] text-muted-foreground">
            第 {{ selectedIndex + 1 }} 章
          </p>
          <details
            v-if="messageOf(activeChapter.prompt)?.content || actionPart(activeChapter.prompt)"
            class="group max-w-xl text-sm text-muted-foreground"
          >
            <summary class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-3 py-1.5 hover:bg-muted/60">
              <MessageSquareQuote class="size-3.5" />
              查看本章提示词
            </summary>
            <div class="mt-3 rounded-xl border bg-card/65 px-5 py-4 text-center">
              <MessageActionBadge
                v-if="actionPart(activeChapter.prompt)"
                :action="actionPart(activeChapter.prompt)!"
              />
              <ConversationMarkdown :model-value="messageOf(activeChapter.prompt)?.content ?? ''" />
            </div>
          </details>
        </div>

        <div class="mx-auto max-w-2xl rounded-2xl border border-border/50 bg-card/82 px-10 py-12 shadow-sm backdrop-blur mobile:rounded-xl mobile:px-5 mobile:py-8">
          <ConversationMarkdown
            :model-value="
              messageOf(activeChapter.container)?.content
                || (generating && activeChapter.container.id === activeContainerId ? '生成中...' : '')
            "
          />
          <template
            v-for="(part, partIndex) in componentParts(activeChapter.container)"
            :key="`${messageOf(activeChapter.container)?.id}:${part.componentId}:${partIndex}`"
          >
            <component
              :is="getGenerationComponent(part.componentId)"
              v-if="getGenerationComponent(part.componentId)"
              v-bind="part.props"
              class="mt-6"
            />
          </template>
        </div>
      </article>
    </div>
  </section>
</template>

<style>
.novel-reader .conversation-markdown .ProseMirror {
  font-family: ui-serif, Georgia, Cambria, "Times New Roman", "Noto Serif SC", serif;
  font-size: 1.04rem;
  line-height: 2;
  text-align: center;
}

.novel-reader .conversation-markdown :where(ul, ol) {
  display: inline-block;
  text-align: left;
}

.novel-reader .conversation-markdown :where(pre, blockquote) {
  text-align: left;
}

.mobile-layout .novel-reader .conversation-markdown .ProseMirror {
  font-size: 1rem;
  line-height: 1.85;
}
</style>
