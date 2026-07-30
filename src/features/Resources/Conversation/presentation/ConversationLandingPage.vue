<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { push } from "notivue";
import {
  Bot,
  Check,
  ChevronDown,
  FolderKanban,
  ListTodo,
  MessageSquare,
  Plus,
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
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ResourceAvatar from "./ResourceAvatar.vue";

const props = defineProps<{
  packageId?: string;
}>();
const conversation = useConversationStore();
const layout = useLayoutStore();
const input = ref("");
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
  await conversation.initialize();
  if (props.packageId && conversation.packages.some((item) => item.id === props.packageId)) {
    selectedPackageId.value = props.packageId;
  }
});

function selectPackage(packageId: string) {
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
    input.value = "";
    await nextTick();
    await conversation.send(prompt);
  } catch (error) {
    push.error(
      error instanceof Error ? error.message : "无法新建对话。",
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
          <div class="text-sm font-medium">新建对话</div>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">
            选择角色包和会话类型，然后开始。
          </p>
        </div>
      </div>

      <section class="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div class="flex min-h-11 items-center gap-2 border-b px-3">
          <FolderKanban class="size-4 shrink-0 text-muted-foreground" />
          <span class="text-xs text-muted-foreground">角色包</span>
          <Popover v-model:open="projectPopoverOpen">
            <PopoverTrigger as-child>
              <Button
                variant="ghost"
                class="h-8 min-w-0 max-w-full justify-start gap-2 px-2 font-normal"
              >
                <ResourceAvatar
                  v-if="selectedPackage"
                  :name="selectedPackage.name"
                  :icon="selectedPackage.icon"
                  class="size-5"
                />
                <span class="min-w-0 truncate">
                  {{
                    createPackageMode
                      ? newPackageName || "新角色包"
                      : selectedPackage?.name ?? "请选择"
                  }}
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
                  @click="chooseNewPackage"
                >
                  <span class="flex size-6 items-center justify-center rounded bg-muted">
                    <Plus class="size-3.5 text-muted-foreground" />
                  </span>
                  <span class="min-w-0 flex-1 truncate">新建角色包并开始</span>
                  <Check v-if="createPackageMode" class="size-4" />
                </button>
                <button
                  v-for="project in filteredProjects"
                  :key="project.id"
                  type="button"
                  class="flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  @click="selectPackage(project.id)"
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
                    v-if="selectedPackageId === project.id"
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
        <div v-if="createPackageMode" class="border-b px-3 py-2">
          <Input v-model="newPackageName" class="h-8" placeholder="新角色包名称" />
        </div>
        <div class="flex items-center gap-1 border-b px-3 py-2">
          <Button
            size="sm"
            :variant="conversationKind === 'chat' ? 'secondary' : 'ghost'"
            class="h-8"
            @click="conversationKind = 'chat'"
          >
            <MessageSquare class="size-4" />
            普通对话
          </Button>
          <Button
            size="sm"
            :variant="conversationKind === 'task' ? 'secondary' : 'ghost'"
            class="h-8"
            @click="conversationKind = 'task'"
          >
            <ListTodo class="size-4" />
            任务对话
          </Button>
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
