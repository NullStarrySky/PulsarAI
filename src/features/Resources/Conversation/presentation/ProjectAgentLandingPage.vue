<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { push } from "notivue";
import {
  Bot,
  Check,
  ChevronDown,
  FolderKanban,
  Search,
  Send,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { builtinProjectAgentPackageId } from "@/features/Agent/domain/project-agent";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ResourceAvatar from "./ResourceAvatar.vue";

const conversation = useConversationStore();
const layout = useLayoutStore();
const input = ref("");
const selectedProjectId = ref("");
const projectPopoverOpen = ref(false);
const projectSearch = ref("");
const starting = ref(false);

const projects = computed(() =>
  conversation.packages
    .filter((item) => !item.builtIn)
    .sort(
      (a, b) =>
        b.conversations.length - a.conversations.length
        || a.name.localeCompare(b.name, "zh-Hans"),
    ),
);
const filteredProjects = computed(() => {
  const keyword = projectSearch.value.trim().toLocaleLowerCase();
  return projects.value.filter(
    (item) =>
      !keyword
      || item.name.toLocaleLowerCase().includes(keyword)
      || item.description?.toLocaleLowerCase().includes(keyword),
  );
});
const selectedProject = computed(() =>
  projects.value.find((item) => item.id === selectedProjectId.value),
);

onMounted(() => {
  void conversation.initialize();
});

function selectProject(projectId: string) {
  selectedProjectId.value = projectId;
  projectPopoverOpen.value = false;
  projectSearch.value = "";
}

async function startConversation() {
  const prompt = input.value.trim();
  if (!prompt || starting.value) return;
  starting.value = true;
  try {
    await conversation.initialize();
    const baseTitle = selectedProject.value?.name ?? "临时对话";
    const title = conversation.uniqueConversationTitle(
      builtinProjectAgentPackageId,
      baseTitle,
    );
    const created = await conversation.createConversation(
      builtinProjectAgentPackageId,
      {
        title,
        projectPackageId: selectedProject.value?.id,
      },
    );
    layout.closeTabsByResource("builtin", "project-agent");
    layout.openResourceTab({
      resourceType: "conversation",
      resourceId: created.id,
      packageId: created.packageId,
      title: created.title,
    });
    input.value = "";
    await nextTick();
    await conversation.send(prompt);
  } catch (error) {
    push.error(
      error instanceof Error ? error.message : "无法启动项目 Agent 对话。",
    );
  } finally {
    starting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background [scrollbar-gutter:stable]">
    <div class="mx-auto flex min-h-full w-full max-w-[800px] flex-col justify-center px-6 py-12 mobile:px-3 mobile:py-6">
      <div class="mb-8 flex items-start gap-3 mobile:mb-5">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card mobile:size-8">
          <Bot class="size-4" />
        </div>
        <div class="min-w-0 pt-1">
          <div class="text-sm font-medium">PulsarAI</div>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">
            你想构建或调整什么？
          </p>
        </div>
      </div>

      <section class="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div class="flex min-h-11 items-center gap-2 border-b px-3">
          <FolderKanban class="size-4 shrink-0 text-muted-foreground" />
          <span class="text-xs text-muted-foreground">项目</span>
          <Popover v-model:open="projectPopoverOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                class="h-8 min-w-0 max-w-full justify-start gap-2 px-2 font-normal"
              >
                <ResourceAvatar
                  v-if="selectedProject"
                  :name="selectedProject.name"
                  :icon="selectedProject.icon"
                  class="size-5"
                />
                <span class="min-w-0 truncate">
                  {{ selectedProject?.name ?? "未指定" }}
                </span>
                <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              class="w-[min(22rem,calc(100vw-2rem))] p-2"
            >
              <div class="relative mb-2">
                <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  v-model="projectSearch"
                  class="h-8 pl-8"
                  placeholder="搜索角色包"
                />
              </div>
              <div class="max-h-64 overflow-y-auto">
                <button
                  type="button"
                  class="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
                  @click="selectProject('')"
                >
                  <span class="flex size-6 items-center justify-center rounded bg-muted">
                    <Bot class="size-3.5 text-muted-foreground" />
                  </span>
                  <span class="min-w-0 flex-1 truncate">未指定项目</span>
                  <Check v-if="!selectedProjectId" class="size-4" />
                </button>
                <button
                  v-for="project in filteredProjects"
                  :key="project.id"
                  type="button"
                  class="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  @click="selectProject(project.id)"
                >
                  <ResourceAvatar
                    :name="project.name"
                    :icon="project.icon"
                    class="size-6"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm">{{ project.name }}</span>
                    <span
                      v-if="project.description"
                      class="block truncate text-xs text-muted-foreground"
                    >
                      {{ project.description }}
                    </span>
                  </span>
                  <Check
                    v-if="selectedProjectId === project.id"
                    class="size-4 shrink-0"
                  />
                </button>
                <p
                  v-if="filteredProjects.length === 0"
                  class="px-2 py-6 text-center text-xs text-muted-foreground"
                >
                  没有匹配的角色包
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div class="px-4 pb-2 pt-3 mobile:px-3">
          <ConversationComposerEditor
            v-model="input"
            :enable-ai="false"
            placeholder="输入消息..."
            @submit="startConversation"
          />
        </div>
        <div class="flex h-11 items-center justify-end px-3 pb-2">
          <Button
            size="icon"
            class="size-8"
            title="发送"
            :disabled="!input.trim() || starting"
            @click="startConversation"
          >
            <Send class="size-4" />
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>
