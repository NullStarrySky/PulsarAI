<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Folder, MoreHorizontal, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { findPluginNodeByPath, type Plugin } from "@/features/Resources/Plugin/domain/plugin-types";
import { pluginGenerateFile } from "@/features/Resources/Plugin/domain/plugin-runtime";
import InlineEditInput from "@/features/UI/presentation/InlineEditInput.vue";

const layout = useLayoutStore();
const conversation = useConversationStore();
const pluginStore = usePluginStore();
const pluginItems = () => (pluginStore as unknown as { plugins: Plugin[] }).plugins;
const globalPluginItems = () => (pluginStore as unknown as { globalPlugins: Plugin[] }).globalPlugins;
const editingPluginId = ref("");
const editingPluginName = ref("");
const creatingLocalPlugin = ref(false);

onMounted(() => {
  void Promise.all([conversation.initialize(), pluginStore.initialize()]);
});
const keyword = computed(() => pluginStore.search.trim().toLocaleLowerCase());
const localPlugin = computed(() => pluginItems().find(
  (plugin) => plugin.packageId === conversation.activePackage?.id,
) ?? null);
const globalPlugins = computed(() => globalPluginItems().filter((plugin) =>
  !keyword.value
  || plugin.name.toLocaleLowerCase().includes(keyword.value)
  || plugin.shortDescription.toLocaleLowerCase().includes(keyword.value)
));


function openPlugin(plugin: Plugin, nodeId?: string) {
  const activePackage = conversation.activePackage;
  pluginStore.openPlugin(plugin.id);

  let targetNodeId = nodeId;
  if (!targetNodeId) {
    const infoNode = findPluginNodeByPath(plugin.root, "info.md");
    targetNodeId = infoNode ? infoNode.id : plugin.root.id;
  }

  layout.openResourceTab({
    resourceType: "plugin",
    resourceId: plugin.id,
    packageId: activePackage?.id,
    title: plugin.packageId === activePackage?.id
      ? `${activePackage.name}资源`
      : plugin.name,
    resourceParams: { nodeId: targetNodeId },
  });
}

async function toggleLocalPlugin(enabled: boolean) {
  const plugin = localPlugin.value;
  const active = conversation.activePackage;
  if (!plugin || !active) return;
  if (!enabled && active.mainPluginId === plugin.id) {
    push.error("主要插件不能停用，请先选择另一个主要插件。");
    return;
  }
  await pluginStore.updatePlugin(plugin.id, { enabled });
}

async function createGlobalPlugin() {
  const plugin = await pluginStore.createGlobalPlugin();
  openPlugin(plugin);
}

async function createLocalPlugin() {
  const active = conversation.activePackage;
  if (!active || creatingLocalPlugin.value) return;
  creatingLocalPlugin.value = true;
  try {
    const plugin = await conversation.ensurePackagePlugin(active.id);
    openPlugin(plugin);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "角色插件创建失败");
  } finally {
    creatingLocalPlugin.value = false;
  }
}

async function restoreBuiltInPlugin(plugin: Plugin) {
  const restored = await pluginStore.restoreBuiltInPlugin(plugin.id);
  if (restored) push.success(`已还原 ${restored.name}`);
}

function hasGenerationProcess(plugin: Plugin) {
  return Boolean(pluginGenerateFile(plugin));
}

async function setMainPlugin(plugin: Plugin) {
  const active = conversation.activePackage;
  if (!active) return;
  if (!hasGenerationProcess(plugin)) {
    push.error(`插件 ${plugin.name} 没有有效的 runtime/generatePath。`);
    return;
  }
  try {
    if (!plugin.enabled) await pluginStore.updatePlugin(plugin.id, { enabled: true });
    const enabledGlobalPluginIds = plugin.packageId === null
      ? [...new Set([...active.enabledGlobalPluginIds, plugin.id])]
      : active.enabledGlobalPluginIds;
    await conversation.updatePackage(active.id, {
      mainPluginId: plugin.id,
      enabledGlobalPluginIds,
    });
  } catch (error) {
    push.error(error instanceof Error ? error.message : "主要插件切换失败");
  }
}

async function toggleGlobalPlugin(plugin: Plugin, enabled: boolean) {
  const active = conversation.activePackage;
  if (!active || plugin.packageId !== null) return;
  if (!enabled && active.mainPluginId === plugin.id) {
    push.error("主要插件不能停用，请先选择另一个主要插件。");
    return;
  }
  const ids = enabled
    ? [...new Set([...active.enabledGlobalPluginIds, plugin.id])]
    : active.enabledGlobalPluginIds.filter((id) => id !== plugin.id);
  try {
    await conversation.updatePackage(active.id, { enabledGlobalPluginIds: ids });
  } catch (error) {
    push.error(error instanceof Error ? error.message : "插件启用状态更新失败");
  }
}

async function deleteGlobalPlugin(plugin: Plugin) {
  try {
    await pluginStore.deletePlugin(plugin.id);
    layout.closeTabsByResource("plugin", plugin.id);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "插件删除失败");
  }
}

function startRenamePlugin(plugin: Plugin) {
  editingPluginId.value = plugin.id;
  editingPluginName.value = plugin.name;
}

async function confirmRenamePlugin() {
  const plugin = pluginItems().find((item) => item.id === editingPluginId.value);
  if (!plugin) return;
  const name = editingPluginName.value.trim() || plugin.name;
  await pluginStore.updatePlugin(plugin.id, { name });
  editingPluginId.value = "";
  editingPluginName.value = "";
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <div class="flex h-12 items-center gap-2 border-b px-3">
      <div class="relative min-w-0 flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="pluginStore.search"
          class="h-8 w-full rounded-md bg-transparent pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-muted/45"
          placeholder="搜索插件"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button size="icon" variant="ghost" class="size-8" title="新建插件">
            <Plus class="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuItem
            :disabled="!conversation.activePackage || Boolean(localPlugin)"
            @click="createLocalPlugin"
          >
            创建角色插件
          </DropdownMenuItem>
          <DropdownMenuItem @click="createGlobalPlugin">创建全局插件</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <ScrollArea class="min-h-0 flex-1">
      <div class="px-2 pb-3">
      <div v-if="pluginStore.loadError" class="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        本地插件数据读取失败；内置插件仍可使用。{{ pluginStore.loadError }}
      </div>
      <section class="pt-3">
        <div class="px-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground">本地插件</div>
        <div
          v-if="localPlugin"
          class="group flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border bg-card/40 px-2.5 py-2 transition-colors hover:bg-accent/55"
          @click="openPlugin(localPlugin)"
        >
          <Folder class="size-8 shrink-0 text-muted-foreground bg-muted/40 p-1.5 rounded-md" />
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-baseline gap-1.5">
              <span class="truncate text-sm font-medium">{{ conversation.activePackage?.name }}资源</span>
              <span v-if="conversation.activePackage?.mainPluginId === localPlugin.id" class="shrink-0 text-[10px] font-medium text-primary">主要</span>
            </div>
            <p class="truncate text-xs text-muted-foreground">角色本地插件目录</p>
          </div>
          <div class="flex items-center gap-1.5" @click.stop>
            <Button
              v-if="conversation.activePackage?.mainPluginId !== localPlugin.id && hasGenerationProcess(localPlugin)"
              size="icon"
              variant="ghost"
              class="size-7"
              title="设为主要插件"
              @click="setMainPlugin(localPlugin)"
            >
              <Star class="size-4" />
            </Button>
            <Switch
              size="sm"
              :model-value="localPlugin.enabled || conversation.activePackage?.mainPluginId === localPlugin.id"
              @update:model-value="toggleLocalPlugin(Boolean($event))"
            />
          </div>
        </div>
        <div v-else class="flex flex-col items-start gap-2 rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
          <span>{{ conversation.activePackage ? "当前角色包还没有角色插件。" : "请先选择角色包。" }}</span>
          <Button
            v-if="conversation.activePackage"
            size="sm"
            variant="outline"
            :disabled="creatingLocalPlugin"
            @click="createLocalPlugin"
          >
            创建角色插件
          </Button>
        </div>
      </section>

      <section class="pt-3">
        <div class="px-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground">全局插件</div>
        <div
          v-for="plugin in globalPlugins"
          :key="plugin.id"
          class="group mb-0.5 flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-accent/55"
          @click="openPlugin(plugin)"
        >
          <img v-if="plugin.icon" :src="plugin.icon" alt="" class="size-8 rounded-md object-cover" />
          <InlineEditInput
            v-if="editingPluginId === plugin.id"
            v-model="editingPluginName"
            class="min-w-0 flex-1"
            placeholder="插件名称"
            @click.stop
            @confirm="confirmRenamePlugin"
            @cancel="editingPluginId = ''"
          />
          <div v-else class="min-w-0 flex-1">
            <div class="flex min-w-0 items-baseline gap-1.5">
              <span class="truncate text-sm font-medium">{{ plugin.name }}</span>
              <span v-if="conversation.activePackage?.mainPluginId === plugin.id" class="shrink-0 text-[10px] font-medium text-primary">主要</span>
              <span v-if="plugin.builtIn" class="shrink-0 text-[10px] text-muted-foreground">系统</span>
            </div>
            <p v-if="plugin.shortDescription" class="truncate text-xs text-muted-foreground">{{ plugin.shortDescription }}</p>
          </div>
          <div class="flex items-center gap-1" @click.stop>
            <Button
              v-if="conversation.activePackage?.mainPluginId !== plugin.id && hasGenerationProcess(plugin)"
              size="icon"
              variant="ghost"
              class="size-7"
              title="设为主要插件"
              @click="setMainPlugin(plugin)"
            >
              <Star class="size-4" />
            </Button>
            <Switch
              size="sm"
              :disabled="conversation.activePackage?.mainPluginId === plugin.id || (!plugin.enabled && !conversation.activePackage?.enabledGlobalPluginIds.includes(plugin.id))"
              :model-value="conversation.activePackage?.enabledGlobalPluginIds.includes(plugin.id) || conversation.activePackage?.mainPluginId === plugin.id"
              @update:model-value="toggleGlobalPlugin(plugin, Boolean($event))"
            />
            <DropdownMenu v-if="editingPluginId !== plugin.id">
              <DropdownMenuTrigger as-child>
                <Button size="icon" variant="ghost" class="mobile-touch-actions size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" title="插件菜单">
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-44">
                <DropdownMenuItem :disabled="!hasGenerationProcess(plugin)" @click="setMainPlugin(plugin)">
                  <Star class="mr-2 size-4" />
                  设为主要插件
                </DropdownMenuItem>
                <DropdownMenuItem @click="startRenamePlugin(plugin)">重命名</DropdownMenuItem>
                <DropdownMenuItem v-if="plugin.builtIn" @click="restoreBuiltInPlugin(plugin)">
                  <RotateCcw class="mr-2 size-4" />
                  还原默认内容
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  :disabled="plugin.builtIn || conversation.activePackage?.mainPluginId === plugin.id"
                  class="text-destructive focus:text-destructive"
                  @click="deleteGlobalPlugin(plugin)"
                >
                  <Trash2 class="mr-2 size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>
      </div>
    </ScrollArea>
  </div>
</template>
