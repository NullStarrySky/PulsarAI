<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MoreHorizontal, Plus, Trash2, Upload } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import type { Plugin } from "@/features/Resources/Plugin/domain/plugin-types";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useDefaultConfigStore } from "../application/default-config-store";

const defaults = useDefaultConfigStore();
const pluginStore = usePluginStore();
const layout = useLayoutStore();
const importInput = ref<HTMLInputElement | null>(null);
const globalPlugins = computed(() => pluginStore.globalPlugins);

onMounted(async () => {
  await Promise.all([defaults.load(), pluginStore.initialize()]);
});

function openPlugin(plugin: Plugin) {
  pluginStore.openPlugin(plugin.id);
  layout.closeSettings();
  layout.openResourceTab({
    resourceType: "plugin",
    resourceId: plugin.id,
    title: plugin.name,
  });
}

async function createGlobalPlugin() {
  const plugin = await pluginStore.createGlobalPlugin();
  openPlugin(plugin);
}

async function importGlobalPlugin(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }

  try {
    const plugin = await pluginStore.importGlobalPlugin(JSON.parse(await file.text()));
    push.success(`已导入 ${plugin.name}`);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "插件导入失败");
  }
}

async function deleteGlobalPlugin(plugin: Plugin) {
  if (plugin.builtIn) {
    return;
  }
  try {
    await pluginStore.deletePlugin(plugin.id);
    layout.closeTabsByResource("plugin", plugin.id);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "插件删除失败");
  }
}

</script>

<template>
  <SettingPage title="默认项" description="统一管理 Pulsar 的默认模型和后续默认行为。">
    <SettingGroup title="模型">
      <SettingItem title="默认模型" description="未显式指定时的对话模型。">
        <ModelSelect
          :model-value="defaults.defaultChatModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setDefaultChatModel"
        />
      </SettingItem>
      <SettingItem title="快速模型" description="用于低延迟、低成本任务。">
        <ModelSelect
          :model-value="defaults.fastModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setFastModel"
        />
      </SettingItem>
      <SettingItem title="向量化模型" description="用于检索和语义索引。">
        <ModelSelect
          :model-value="defaults.embeddingModel"
          api-type="embedding"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setEmbeddingModel"
        />
      </SettingItem>
      <SettingItem title="图片生成模型" description="用于文生图或图像编辑。">
        <ModelSelect
          :model-value="defaults.imageModel"
          api-type="image"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setImageModel"
        />
      </SettingItem>
      <SettingItem title="语音生成模型" description="用于文本转语音；可选择模型提供商或 Edge TTS 专用服务。">
        <ModelSelect
          :model-value="defaults.speechModel"
          api-type="tts"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setSpeechModel"
        />
      </SettingItem>
      <SettingItem title="语音转写模型" description="用于将音频转换为文字。">
        <ModelSelect
          :model-value="defaults.transcriptionModel"
          api-type="asr"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setTranscriptionModel"
        />
      </SettingItem>
    </SettingGroup>

    <SettingGroup
      title="全局插件"
      description="管理全局插件的安装级可用状态；每个角色包再按稳定 ID 独立选择主要插件和启用集合。"
    >
      <div class="flex items-center justify-end gap-1 px-4 py-2">
        <Button
          size="icon"
          variant="ghost"
          class="size-8"
          title="导入全局插件"
          @click="importInput?.click()"
        >
          <Upload class="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          class="size-8"
          title="新建全局插件"
          @click="createGlobalPlugin"
        >
          <Plus class="size-4" />
        </Button>
      </div>

      <div
        v-for="plugin in globalPlugins"
        :key="plugin.id"
        class="group flex min-h-14 items-center gap-3 px-4 py-2.5"
      >
        <img
          v-if="plugin.icon"
          :src="plugin.icon"
          alt=""
          class="size-8 rounded-md object-cover"
        />
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          @click="openPlugin(plugin)"
        >
          <span class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ plugin.name }}</span>
            <span
              v-if="plugin.builtIn"
              class="text-[10px] text-muted-foreground"
            >
              系统
            </span>
          </span>
          <span
            v-if="plugin.shortDescription"
            class="mt-0.5 block truncate text-xs text-muted-foreground"
          >
            {{ plugin.shortDescription }}
          </span>
        </button>
        <Switch
          size="sm"
          :model-value="plugin.enabled"
          @update:model-value="pluginStore.updatePlugin(plugin.id, { enabled: Boolean($event) })"
        />
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              size="icon"
              variant="ghost"
              class="mobile-touch-actions size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              title="插件菜单"
            >
              <MoreHorizontal class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-36">
            <DropdownMenuItem
              :disabled="plugin.builtIn"
              class="text-destructive focus:text-destructive"
              @click="deleteGlobalPlugin(plugin)"
            >
              <Trash2 class="mr-2 size-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SettingGroup>

    <input
      ref="importInput"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="importGlobalPlugin"
    />
  </SettingPage>
</template>
