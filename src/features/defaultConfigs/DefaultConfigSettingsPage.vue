<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import { useDefaultConfigStore } from "./default-config-store";

const defaults = useDefaultConfigStore();
const sttPolishPromptDraft = ref("");

onMounted(async () => {
	await defaults.load();
	sttPolishPromptDraft.value = defaults.sttPolishPrompt;
});

onBeforeUnmount(() => {
	if (sttPolishPromptDraft.value !== defaults.sttPolishPrompt) {
		void defaults.setSttPolishPrompt(sttPolishPromptDraft.value);
	}
});

function updateSttPolishPromptDraft(value: string | number) {
	sttPolishPromptDraft.value = String(value);
}

function saveSttPolishPrompt() {
	if (sttPolishPromptDraft.value !== defaults.sttPolishPrompt) {
		void defaults.setSttPolishPrompt(sttPolishPromptDraft.value);
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

  </SettingPage>
</template>
