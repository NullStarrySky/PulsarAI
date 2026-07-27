<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileDown,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import type { PluginMetaEntry, PluginResource, PluginResourceContainer } from "@/features/Resources/Plugin/domain/plugin-types";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import PluginContainerEditorDialog from "./PluginContainerEditorDialog.vue";
import PluginResourceEditorDialog from "./PluginResourceEditorDialog.vue";
import PluginResourceInjectionMenu from "./PluginResourceInjectionMenu.vue";
import PluginResourceMetaDialog from "./PluginResourceMetaDialog.vue";

const props = defineProps<{
  resourceId: string;
  packageId?: string;
}>();

const pluginStore = usePluginStore();
const activeTab = ref("description");
const contentDialogOpen = ref(false);
const metaDialogOpen = ref(false);
const containerDialogOpen = ref(false);
const editingContainerId = ref("");
const editingResourceId = ref("");
const importInput = ref<HTMLInputElement | null>(null);
const importContainerId = ref("");
const processDraft = ref("");
let processSaveTimer: ReturnType<typeof setTimeout> | null = null;

const plugin = computed(() => pluginStore.plugins.find((item) => item.id === props.resourceId) ?? null);
const editingContainer = computed(() => plugin.value?.resources.find((container) => container.id === editingContainerId.value) ?? null);
const editingResource = computed(() =>
  editingContainer.value?.resources.find((resource) => resource.id === editingResourceId.value) ?? null,
);

onMounted(async () => {
  await pluginStore.initialize();
  pluginStore.openPlugin(props.resourceId);
});

onBeforeUnmount(() => {
  if (processSaveTimer) {
    clearTimeout(processSaveTimer);
  }
});

watch(
  () => props.resourceId,
  (resourceId) => {
    pluginStore.openPlugin(resourceId);
    processDraft.value = plugin.value?.generationProcess ?? "";
  },
);

watch(
  () => plugin.value?.id,
  () => {
    processDraft.value = plugin.value?.generationProcess ?? "";
  },
  { immediate: true },
);

watch(processDraft, () => {
  if (!plugin.value || !plugin.value.generationProcess) {
    return;
  }
  if (processSaveTimer) {
    clearTimeout(processSaveTimer);
  }
  processSaveTimer = setTimeout(() => {
    if (plugin.value) {
      void pluginStore.updatePlugin(plugin.value.id, { generationProcess: processDraft.value });
    }
  }, 650);
});

function enabledCount(container: PluginResourceContainer) {
  return container.resources.filter((resource) => resource.enabled).length;
}

function sortedResources(container: PluginResourceContainer) {
  return [...container.resources].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "zh-Hans"));
}

function metaRows(meta: PluginMetaEntry[]) {
  return meta;
}

function isHttpUrl(value: string) {
  return /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(value.trim());
}

async function openMetaUrl(value: string) {
  const url = value.trim();
  if (isHttpUrl(url)) {
    await openUrl(url);
  }
}

async function persistPlugin() {
  if (!plugin.value) {
    return;
  }
  await pluginStore.persistPlugin(plugin.value);
}

async function addMeta() {
  if (!plugin.value) {
    return;
  }
  plugin.value.meta.push({
    id: crypto.randomUUID(),
    key: "键",
    value: "值",
  });
  await persistPlugin();
}

async function removeMeta(metaId: string) {
  if (!plugin.value) {
    return;
  }
  plugin.value.meta = plugin.value.meta.filter((item) => item.id !== metaId);
  await persistPlugin();
}

async function createResource(container: PluginResourceContainer) {
  if (!plugin.value) {
    return;
  }
  const resource = await pluginStore.createResource(plugin.value.id, container.id);
  if (!resource) {
    return;
  }
  openResourceContent(container, resource);
}

function chooseImport(container: PluginResourceContainer) {
  importContainerId.value = container.id;
  importInput.value?.click();
}

async function importResource(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !plugin.value || !importContainerId.value) {
    return;
  }
  const container = plugin.value.resources.find((item) => item.id === importContainerId.value);
  if (!container) {
    return;
  }
  const text = await file.text();
  await pluginStore.createResource(plugin.value.id, container.id, {
    name: file.name,
    content: container.contentControl.resourcesType === "media" ? { kind: "url-or-text", value: text } : text,
  });
  if (importInput.value) {
    importInput.value.value = "";
  }
}

function selectResource(container: PluginResourceContainer, resource: PluginResource) {
  editingContainerId.value = container.id;
  editingResourceId.value = resource.id;
}

function openResourceContent(container: PluginResourceContainer, resource: PluginResource) {
  selectResource(container, resource);
  contentDialogOpen.value = true;
}

function openResourceMeta(container: PluginResourceContainer, resource: PluginResource) {
  selectResource(container, resource);
  metaDialogOpen.value = true;
}

function openContainerEditor(container: PluginResourceContainer) {
  editingContainerId.value = container.id;
  editingResourceId.value = "";
  containerDialogOpen.value = true;
}

async function toggleContainerCollapsed(container: PluginResourceContainer) {
  container.collapsed = !container.collapsed;
  await persistPlugin();
}

async function startProcessEditing() {
  if (!plugin.value) {
    return;
  }
  const source = plugin.value.generationProcess || "async function generate(context) {\n  return context.defaultGenerate();\n}\n";
  processDraft.value = source;
  await pluginStore.updatePlugin(plugin.value.id, { generationProcess: source });
}
</script>

<template>
  <div v-if="plugin" class="min-h-0 flex-1 overflow-y-auto bg-background [scrollbar-gutter:stable]">
    <div class="mx-auto flex w-full max-w-[800px] flex-col px-6 py-8 sm:px-8 mobile:px-4 mobile:py-5">
      <header class="flex min-h-14 items-center gap-4 mobile:gap-3">
        <img v-if="plugin.icon" :src="plugin.icon" alt="" class="size-12 rounded-lg object-cover" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <input
              v-model="plugin.name"
              class="min-w-0 w-full bg-transparent p-0 text-2xl font-semibold leading-tight outline-none mobile:text-xl"
              placeholder="插件名称"
              @change="persistPlugin"
            />
          </div>
          <input
            v-model="plugin.shortDescription"
            class="mt-1 h-5 w-full bg-transparent p-0 text-sm leading-5 text-muted-foreground outline-none"
            placeholder=""
            @change="persistPlugin"
          />
        </div>
        <div class="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button size="icon" variant="ghost" class="size-8" title="插件菜单">
                <MoreHorizontal class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-40">
              <DropdownMenuItem :disabled="plugin.packageId === null" @click="pluginStore.updatePlugin(plugin.id, { main: !plugin.main })">
                <Star class="mr-2 size-4" />
                {{ plugin.main ? "取消主要" : "设为主要" }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                :disabled="plugin.packageId === null"
                class="text-destructive focus:text-destructive"
                @click="pluginStore.deletePlugin(plugin.id)"
              >
                <Trash2 class="mr-2 size-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <nav class="mt-6 flex w-full items-center gap-6 overflow-x-auto border-b text-sm [scrollbar-width:none] mobile:mt-4 mobile:gap-5">
        <button
          type="button"
          class="relative h-10 transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px after:bg-transparent"
          :class="activeTab === 'description' ? 'font-medium text-foreground after:bg-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'description'"
        >
          描述
        </button>
        <button
          type="button"
          class="relative h-10 transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px after:bg-transparent"
          :class="activeTab === 'resources' ? 'font-medium text-foreground after:bg-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'resources'"
        >
          资源
        </button>
        <button
          type="button"
          class="relative h-10 transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-px after:bg-transparent"
          :class="activeTab === 'process' ? 'font-medium text-foreground after:bg-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'process'"
        >
          生成流程
        </button>
      </nav>

      <div>
        <div v-if="activeTab === 'description'" class="pt-7">
          <div class="plugin-description-editor min-h-64 rounded-lg bg-muted/20 px-5 py-4 mobile:px-3">
            <ConversationComposerEditor
              v-model="plugin.description"
              placeholder=""
              @update:model-value="persistPlugin"
            />
          </div>

          <section class="mt-9">
            <div class="flex h-10 items-center justify-between border-b">
              <h2 class="text-sm font-semibold">信息</h2>
              <Button size="icon" variant="ghost" class="size-8" title="添加信息" @click="addMeta">
                <Plus class="size-4" />
              </Button>
            </div>
            <div class="py-1">
              <div
                v-for="entry in metaRows(plugin.meta)"
                :key="entry.id"
                class="group grid min-h-10 grid-cols-[7rem_1.75rem_minmax(0,1fr)_1.75rem] items-center gap-2 mobile:grid-cols-[5rem_1.75rem_minmax(0,1fr)_1.75rem]"
              >
                <input
                  v-model="entry.key"
                  class="min-w-0 bg-transparent p-0 text-sm text-muted-foreground outline-none selection:bg-primary/20"
                  placeholder="键"
                  @change="persistPlugin"
                />
                <Button
                  v-if="isHttpUrl(entry.value)"
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="size-7 text-muted-foreground hover:text-foreground"
                  title="打开链接"
                  @click="openMetaUrl(entry.value)"
                >
                  <ExternalLink class="size-4" />
                </Button>
                <span v-else class="size-7" />
                <input
                  v-model="entry.value"
                  class="min-w-0 bg-transparent p-0 text-sm outline-none selection:bg-primary/20"
                  placeholder="值"
                  @change="persistPlugin"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  class="mobile-touch-actions size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  title="删除信息"
                  @click="removeMeta(entry.id)"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'resources'" class="pt-3">
          <section v-for="container in plugin.resources" :key="container.id" class="border-b py-2 last:border-b-0">
            <div
              class="group/container-header -mx-2 grid min-h-12 cursor-pointer items-center gap-2 rounded-md px-2 transition-colors hover:bg-accent/45"
              :class="container.icon ? 'grid-cols-[2rem_2rem_minmax(0,1fr)_auto]' : 'grid-cols-[2rem_minmax(0,1fr)_auto]'"
              @click="toggleContainerCollapsed(container)"
            >
              <button
                type="button"
                class="pointer-events-none flex size-8 items-center justify-center text-muted-foreground"
                tabindex="-1"
                aria-hidden="true"
              >
                <ChevronRight v-if="container.collapsed" class="size-4" />
                <ChevronDown v-else class="size-4" />
              </button>
              <img v-if="container.icon" :src="container.icon" alt="" class="size-8 rounded-md object-cover" />
              <div class="flex min-w-0 items-center gap-2">
                <h2 class="truncate text-sm font-semibold">{{ container.name }}</h2>
                <span class="shrink-0 text-sm font-semibold text-muted-foreground">
                    {{ container.contentControl.selectable === 'none' ? container.resources.length : `${enabledCount(container)}/${container.resources.length}` }}
                </span>
              </div>
              <div class="mobile-touch-actions flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/container-header:opacity-100" @click.stop>
                <Button size="icon" variant="ghost" class="size-8" title="新建资源" @click="createResource(container)">
                  <Plus class="size-4" />
                </Button>
                <Button
                  v-if="container.contentControl.importable"
                  size="icon"
                  variant="ghost"
                  class="size-8"
                  title="导入资源"
                  @click="chooseImport(container)"
                >
                  <FileDown class="size-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button size="icon" variant="ghost" class="size-8" title="容器菜单">
                      <MoreHorizontal class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-40">
                    <DropdownMenuItem @click="openContainerEditor(container)">编辑容器属性</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div
              v-if="!container.collapsed"
              class="mt-1"
            >
              <div
                v-for="resource in sortedResources(container)"
                :key="resource.id"
                class="group/resource -mx-2 grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 transition-colors hover:bg-accent/55"
              >
                <button
                  type="button"
                  class="flex min-h-12 min-w-0 items-center gap-3 text-left"
                  :class="container.icon ? 'pl-20' : 'pl-10'"
                  @click="openResourceContent(container, resource)"
                >
                  <img v-if="resource.icon" :src="resource.icon" alt="" class="size-8 rounded-md object-cover" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{{ resource.name }}</span>
                    <span v-if="resource.description" class="block truncate text-xs text-muted-foreground">
                      {{ resource.description }}
                    </span>
                  </span>
                </button>

                <div class="flex items-center gap-1.5 pr-1">
                  <span v-if="resource.isTemplate" class="text-xs text-muted-foreground">
                    模板
                  </span>
                  <PluginResourceInjectionMenu
                    v-if="container.contentControl.insertable"
                    :plugin-id="plugin.id"
                    :container-id="container.id"
                    :resource="resource"
                  />
                  <Switch
                    v-if="container.contentControl.selectable !== 'none'"
                    size="sm"
                    :model-value="resource.enabled"
                    @update:model-value="pluginStore.toggleResourceEnabled(plugin.id, container.id, resource.id, Boolean($event))"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button size="icon" variant="ghost" class="mobile-touch-actions size-8 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/resource:opacity-100" title="资源菜单">
                        <MoreHorizontal class="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" class="w-40">
                      <DropdownMenuItem @click="openResourceMeta(container, resource)">编辑元信息</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        @click="pluginStore.deleteResource(plugin.id, container.id, resource.id)"
                      >
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div v-if="container.resources.length === 0" class="py-7 pl-10 text-sm text-muted-foreground">
                暂无资源
              </div>
            </div>
          </section>
        </div>

        <div v-else class="h-[min(620px,calc(100vh-220px))] pt-7">
          <div v-if="!plugin.generationProcess" class="py-3">
            <h2 class="text-base font-semibold">继承默认生成流程</h2>
            <p class="mt-1 text-sm text-muted-foreground">当前插件没有自定义流程，生成时会继续使用默认流程。</p>
            <Button class="mt-4" variant="ghost" @click="startProcessEditing">继续编辑</Button>
          </div>
          <template v-else>
            <JavaScriptCodeMirrorEditor v-model="processDraft" />
          </template>
        </div>
      </div>
    </div>

    <input ref="importInput" type="file" class="hidden" @change="importResource" />
    <PluginResourceEditorDialog
      v-model:open="contentDialogOpen"
      :plugin-id="plugin.id"
      :container="editingContainer"
      :resource="editingResource"
    />
    <PluginResourceMetaDialog
      v-model:open="metaDialogOpen"
      :plugin-id="plugin.id"
      :container="editingContainer"
      :resource="editingResource"
    />
    <PluginContainerEditorDialog
      v-model:open="containerDialogOpen"
      :plugin="plugin"
      :container="editingContainer"
    />
  </div>
</template>

<style>
.plugin-description-editor :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 16rem !important;
  max-height: none !important;
}
</style>
