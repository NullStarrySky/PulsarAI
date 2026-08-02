<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MoreHorizontal, Plus, Search, ShieldCheck, Star, Trash2 } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
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
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
  type Plugin,
} from "@/features/Resources/Plugin/domain/plugin-types";
import CapabilityGrantEditor from "@/features/Capabilities/presentation/CapabilityGrantEditor.vue";
import type { CapabilityGrants } from "@/features/Capabilities/domain/capability";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import InlineEditInput from "@/features/UI/presentation/InlineEditInput.vue";

const layout = useLayoutStore();
const conversation = useConversationStore();
const pluginStore = usePluginStore();
const defaults = useDefaultConfigStore();
const editingPluginId = ref("");
const editingPluginName = ref("");

onMounted(() => {
  void Promise.all([conversation.initialize(), pluginStore.initialize(), defaults.load()]);
});

const usesDefaultCapabilities = computed(
  () => conversation.activePackage?.capabilities === undefined,
);
const keyword = computed(() => pluginStore.search.trim().toLocaleLowerCase());
const localPlugin = computed(() => pluginStore.plugins.find(
  (plugin) => plugin.id === conversation.activePackage?.pluginId,
) ?? null);
const globalPlugins = computed(() => pluginStore.globalPlugins.filter((plugin) =>
  !keyword.value
  || plugin.name.toLocaleLowerCase().includes(keyword.value)
  || plugin.shortDescription.toLocaleLowerCase().includes(keyword.value)
));

async function setUsesDefaultCapabilities(enabled: boolean) {
  const active = conversation.activePackage;
  if (!active) return;
  await conversation.updatePackage(active.id, {
    capabilities: enabled
      ? undefined
      : structuredClone(defaults.defaultCapabilities),
  });
}

async function updatePackageCapabilities(value: CapabilityGrants) {
  const active = conversation.activePackage;
  if (active) await conversation.updatePackage(active.id, { capabilities: value });
}

function openPlugin(plugin: Plugin) {
  const activePackage = conversation.activePackage;
  pluginStore.openPlugin(plugin.id);
  layout.openResourceTab({
    resourceType: "plugin",
    resourceId: plugin.id,
    packageId: activePackage?.id,
    title: plugin.packageId === activePackage?.id
      ? `${activePackage.name}资源`
      : plugin.name,
  });
}

async function createGlobalPlugin() {
  const plugin = await pluginStore.createGlobalPlugin();
  openPlugin(plugin);
}

function hasGenerationProcess(plugin: Plugin) {
  const context = findPluginNodeByPath(plugin.root, pluginConventions.context);
  const process = findPluginNodeByPath(plugin.root, [
    pluginConventions.agentProcessFolder,
    pluginConventions.agentProcessEntry,
  ]);
  return context?.kind === "file"
    && pluginFileType(context.name) === "markdown"
    && process?.kind === "file"
    && pluginFileType(process.name) === "javascript"
    && typeof process.content === "string"
    && Boolean(process.content.trim());
}

async function setMainPlugin(plugin: Plugin) {
  const active = conversation.activePackage;
  if (!active) return;
  if (!hasGenerationProcess(plugin)) {
    push.error(`插件 ${plugin.name} 没有有效的 context.md 与 agentprocess/index.js。`);
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
  const plugin = pluginStore.plugins.find((item) => item.id === editingPluginId.value);
  if (!plugin) return;
  const name = editingPluginName.value.trim() || plugin.name;
  await pluginStore.updatePlugin(plugin.id, { name });
  editingPluginId.value = "";
  editingPluginName.value = "";
}
</script>

<template>
  <div class="flex min-w-72 flex-1 flex-col overflow-hidden">
    <div class="flex h-12 items-center gap-2 border-b px-3">
      <div class="relative min-w-0 flex-1">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="pluginStore.search"
          class="h-8 w-full rounded-md bg-transparent pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-muted/45"
          placeholder="搜索全局插件"
        />
      </div>
      <Button size="icon" variant="ghost" class="size-8" title="新建全局插件" @click="createGlobalPlugin">
        <Plus class="size-4" />
      </Button>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-3">
      <details class="mt-3 rounded-lg border bg-card/40">
        <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
          <ShieldCheck class="size-4 text-muted-foreground" />
          Feature API 权限
        </summary>
        <div class="border-t p-2">
          <div class="mb-2 flex min-h-10 items-center justify-between gap-3 px-1">
            <div>
              <div class="text-xs font-medium">继承默认权限</div>
              <div class="text-[11px] text-muted-foreground">关闭后仅影响当前角色包。</div>
            </div>
            <Switch size="sm" :model-value="usesDefaultCapabilities" @update:model-value="setUsesDefaultCapabilities(Boolean($event))" />
          </div>
          <CapabilityGrantEditor
            v-if="conversation.activePackage?.capabilities"
            compact
            :model-value="conversation.activePackage.capabilities"
            @update:model-value="updatePackageCapabilities"
          />
          <p v-else class="px-1 pb-1 text-xs leading-5 text-muted-foreground">
            当前角色包使用“设置 → 默认项”中的权限配置。
          </p>
        </div>
      </details>

      <section class="pt-3">
        <div class="px-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground">角色资源</div>
        <div
          v-if="localPlugin"
          role="button"
          tabindex="0"
          class="group mb-0.5 flex min-h-12 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/55"
          @click="openPlugin(localPlugin)"
          @keydown.enter="openPlugin(localPlugin)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate text-sm font-medium">{{ conversation.activePackage?.name }}资源</span>
              <span v-if="conversation.activePackage?.mainPluginId === localPlugin.id" class="text-[10px] font-medium text-primary">主要</span>
            </div>
            <p class="truncate text-xs text-muted-foreground">角色包唯一的本地文档与资源容器</p>
          </div>
          <Button
            v-if="conversation.activePackage?.mainPluginId !== localPlugin.id && hasGenerationProcess(localPlugin)"
            size="icon"
            variant="ghost"
            class="size-7"
            title="设为主要插件"
            @click.stop="setMainPlugin(localPlugin)"
          >
            <Star class="size-4" />
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
            <Switch
              size="sm"
              :disabled="!plugin.enabled && conversation.activePackage?.mainPluginId !== plugin.id"
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
  </div>
</template>
