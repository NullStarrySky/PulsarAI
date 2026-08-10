<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { MoreHorizontal, Plus, RotateCcw, Trash2, Upload } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
const optimizationPromptDraft = ref("");
const sttPolishPromptDraft = ref("");
const globalPlugins = computed(() => pluginStore.globalPlugins);

onMounted(async () => {
  await Promise.all([defaults.load(), pluginStore.initialize()]);
  optimizationPromptDraft.value = defaults.promptOptimizationPrompt;
  sttPolishPromptDraft.value = defaults.sttPolishPrompt;
});

onBeforeUnmount(() => {
  if (optimizationPromptDraft.value !== defaults.promptOptimizationPrompt) {
    void defaults.setPromptOptimizationPrompt(optimizationPromptDraft.value);
  }
  if (sttPolishPromptDraft.value !== defaults.sttPolishPrompt) {
    void defaults.setSttPolishPrompt(sttPolishPromptDraft.value);
  }
});

function updateOptimizationPromptDraft(value: string | number) {
  optimizationPromptDraft.value = String(value);
}

function saveOptimizationPrompt() {
  if (optimizationPromptDraft.value !== defaults.promptOptimizationPrompt) {
    void defaults.setPromptOptimizationPrompt(optimizationPromptDraft.value);
  }
}

function updateSttPolishPromptDraft(value: string | number) {
  sttPolishPromptDraft.value = String(value);
}

function saveSttPolishPrompt() {
  if (sttPolishPromptDraft.value !== defaults.sttPolishPrompt) {
    void defaults.setSttPolishPrompt(sttPolishPromptDraft.value);
  }
}

function openPlugin(plugin: Plugin) {
  pluginStore.openPlugin(plugin.id);
  layout.closeSettings();
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
  } catch (error) {
    push.error(error instanceof Error ? error.message : "插件删除失败");
  }
}

async function restoreBuiltInPlugin(plugin: Plugin) {
  const restored = await pluginStore.restoreBuiltInPlugin(plugin.id);
  if (restored) push.success(`已还原 ${restored.name}`);
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

    <SettingGroup title="提示词优化">
      <SettingItem title="优化模型" description="执行提示词优化时使用的文本模型。">
        <ModelSelect
          :model-value="defaults.promptOptimizationModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setPromptOptimizationModel"
        />
      </SettingItem>
      <SettingItem
        title="优化提示词"
        :description="'定义如何改写输入内容；使用 {{prompt}} 表示当前输入。'"
      >
        <template #bottom>
          <Textarea
            :model-value="optimizationPromptDraft"
            class="min-h-36 resize-y"
            placeholder="输入提示词优化模板"
            @update:model-value="updateOptimizationPromptDraft"
            @blur="saveOptimizationPrompt"
          />
        </template>
      </SettingItem>
    </SettingGroup>

    <SettingGroup title="语音转文本 (STT)">
      <SettingItem title="识别语言" description="指定语音识别的默认语言（支持自动检测或特定语种）。">
        <Select :model-value="defaults.sttLanguage" @update:model-value="(val) => defaults.setSttLanguage(String(val || 'auto'))">
          <SelectTrigger class="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自动检测</SelectItem>
            <SelectItem value="zh">中文</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
            <SelectItem value="ko">한국어</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>

      <SettingItem title="自动进行语音润色" description="开启后，在语音转写完成后自动调用文本模型对结果进行精简与修饰。">
        <Switch
          :checked="defaults.sttAutoPolish"
          @update:checked="defaults.setSttAutoPolish"
        />
      </SettingItem>

      <SettingItem title="语音润色模型" description="用于对识别后的文本进行润色的文本模型。">
        <ModelSelect
          :model-value="defaults.sttPolishModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="defaults.setSttPolishModel"
        />
      </SettingItem>

      <SettingItem
        title="润色提示词"
        description="定义语音识别文本的润色规则；使用 {{text}} 表示识别出的原始文本。"
      >
        <template #bottom>
          <Textarea
            :model-value="sttPolishPromptDraft"
            class="min-h-28 resize-y"
            placeholder="输入语音润色提示词"
            @update:model-value="updateSttPolishPromptDraft"
            @blur="saveSttPolishPrompt"
          />
        </template>
      </SettingItem>
    </SettingGroup>

    <SettingGroup
      title="全局插件"
    >
      <template #actions>
        <Button
          size="icon"
          variant="ghost"
          class="size-7 rounded-md hover:bg-muted"
          title="导入全局插件"
          @click="importInput?.click()"
        >
          <Upload class="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          class="size-7 rounded-md hover:bg-muted"
          title="新建全局插件"
          @click="createGlobalPlugin"
        >
          <Plus class="size-4" />
        </Button>
      </template>

      <div
        v-for="plugin in globalPlugins"
        :key="plugin.id"
        class="group flex min-h-12 items-center gap-3 px-4 py-2"
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
            <DropdownMenuItem v-if="plugin.builtIn" @click="restoreBuiltInPlugin(plugin)">
              <RotateCcw class="mr-2 size-4" />
              还原默认内容
            </DropdownMenuItem>
            <DropdownMenuItem
              v-else
              class="text-destructive focus:text-destructive"
              @click="deleteGlobalPlugin(plugin)"
            >
              <Trash2 class="mr-2 size-4" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div v-if="pluginStore.loadError" class="px-4 py-3 text-sm text-destructive">
        本地插件数据读取失败；内置插件仍可使用。{{ pluginStore.loadError }}
      </div>
      <div v-else-if="!globalPlugins.length" class="px-4 py-6 text-center text-sm text-muted-foreground">
        暂无全局插件。
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
