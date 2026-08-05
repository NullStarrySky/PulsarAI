<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import ModelCapabilityProviderForm from "@/features/ModelConnection/presentation/ModelCapabilityProviderForm.vue";
import ServiceProviderSettingsLayout from "@/features/ModelConnection/presentation/ServiceProviderSettingsLayout.vue";
import { useModelCapabilityProviders } from "@/features/ModelConnection/application/use-model-capability-providers";
import type { ServiceProviderView } from "@/features/ModelConnection/domain/service-provider";
import {
  getDefaultConfig,
  setDefaultConfig,
  setSpeechModel,
} from "@/features/defaultConfigs/application/default-config-service";
import { generateSpeech, listTextToSpeechVoices } from "../application/text-to-speech";
import { EDGE_TTS_MODEL_REF } from "../infrastructure/edge-tts-speech-model";
import {
  createDefaultVolcengineTtsSettings,
  createDefaultElevenLabsTtsSettings,
  createDefaultAzureTtsSettings,
  createElevenLabsTtsModelRef,
  createVolcengineTtsModelRef,
  AZURE_TTS_MODEL_REF,
  AZURE_TTS_PROVIDER_ID,
  ELEVENLABS_TTS_PROVIDER_ID,
  VOLCENGINE_TTS_PROVIDER_ID,
  type SystemSpeechVoice,
} from "../domain/tts";
import {
  SYSTEM_TTS_SERVICE_ID,
  getSystemTtsStatus,
  listSystemTtsVoices,
  previewSystemTtsVoice,
  speakWithSystemTts,
  stopSystemTts,
} from "../application/system-text-to-speech";
import {
  getVolcengineTtsCredentialStatus,
  loadVolcengineTtsSettings,
  saveVolcengineTtsAccessKey,
  saveVolcengineTtsAppId,
  saveVolcengineTtsSettings,
} from "../application/volcengine-tts-settings";
import {
  hasElevenLabsTtsApiKey,
  loadElevenLabsTtsSettings,
  saveElevenLabsTtsApiKey,
  saveElevenLabsTtsSettings,
} from "../application/elevenlabs-tts-settings";
import {
  hasAzureTtsApiKey,
  loadAzureTtsSettings,
  saveAzureTtsApiKey,
  saveAzureTtsSettings,
} from "../application/azure-tts-settings";
import {
  listElevenLabsModels,
  listElevenLabsVoices,
  type ElevenLabsModel,
  type ElevenLabsVoice,
} from "../infrastructure/elevenlabs-tts-client";
import {
  listAzureSpeechVoices,
  type AzureSpeechVoice,
} from "../infrastructure/azure-tts-client";

const EDGE_ENABLED_KEY = "tts.edgeTts.enabled";
const SYSTEM_ENABLED_KEY = "tts.system.enabled";
const secretMask = "••••••••";
const service = useModelCapabilityProviders("tts");
const search = ref("");
const activeServiceId = ref(SYSTEM_TTS_SERVICE_ID);
const enabledCollapsed = ref(false);
const disabledCollapsed = ref(false);
const edgeEnabled = ref(true);
const systemEnabled = ref(true);
const volcengineSettings = ref(createDefaultVolcengineTtsSettings());
const volcengineInitialized = ref(false);
const volcengineAppId = ref("");
const volcengineAccessKey = ref("");
const volcengineContext = ref("");
const elevenLabsSettings = ref(createDefaultElevenLabsTtsSettings());
const elevenLabsInitialized = ref(false);
const elevenLabsApiKey = ref("");
const elevenLabsVoices = ref<ElevenLabsVoice[]>([]);
const elevenLabsModels = ref<ElevenLabsModel[]>([]);
const azureSettings = ref(createDefaultAzureTtsSettings());
const azureInitialized = ref(false);
const azureApiKey = ref("");
const azureVoices = ref<AzureSpeechVoice[]>([]);
const text = ref("你好，这是一段 Pulsar TTS 服务测试语音。");
const systemLanguage = ref("");
const systemVoice = ref("");
const systemRate = ref(1);
const systemPitch = ref(1);
const systemVolume = ref(1);
const systemVoices = ref<SystemSpeechVoice[]>([]);
const edgeVoice = ref("zh-CN-XiaoxiaoNeural");
const modelVoice = ref("alloy");
const edgeRate = ref("+0%");
const edgeVolume = ref("+0%");
const edgePitch = ref("+0Hz");
const modelSpeed = ref(1);
const voices = ref([
  { value: "zh-CN-XiaoxiaoNeural", label: "zh-CN · XiaoxiaoNeural" },
  { value: "en-US-EmmaMultilingualNeural", label: "en-US · EmmaMultilingualNeural" },
]);
const loadingVoices = ref(false);
const testing = ref(false);
const audioUrl = ref("");

const providers = computed<ServiceProviderView[]>(() => [
  {
    id: SYSTEM_TTS_SERVICE_ID,
    name: "系统 TTS",
    description: "直接使用操作系统语音合成器并播放，不生成音频文件。",
    enabled: systemEnabled.value,
    source: "feature",
  },
  {
    id: "edge-tts",
    name: "Edge TTS",
    description: "Microsoft Edge 在线语音专用服务，无需 API Key。",
    enabled: edgeEnabled.value,
    source: "feature",
  },
  {
    id: ELEVENLABS_TTS_PROVIDER_ID,
    name: "ElevenLabs",
    description: "远程专业语音服务，动态读取模型与账户声音。",
    enabled: elevenLabsSettings.value.enabled,
    source: "feature",
  },
  {
    id: AZURE_TTS_PROVIDER_ID,
    name: "Azure Speech",
    description: "Microsoft Azure 区域化语音合成与 SSML 服务。",
    enabled: azureSettings.value.enabled,
    source: "feature",
  },
  {
    id: VOLCENGINE_TTS_PROVIDER_ID,
    name: "豆包语音",
    description: "火山引擎 OpenSpeech 远程语音专用服务。",
    enabled: volcengineSettings.value.enabled,
    source: "feature",
  },
  ...service.providerViews.value,
]);
const isSystem = computed(() => activeServiceId.value === SYSTEM_TTS_SERVICE_ID);
const isEdge = computed(() => activeServiceId.value === "edge-tts");
const isVolcengine = computed(() => activeServiceId.value === VOLCENGINE_TTS_PROVIDER_ID);
const isElevenLabs = computed(() => activeServiceId.value === ELEVENLABS_TTS_PROVIDER_ID);
const isAzure = computed(() => activeServiceId.value === AZURE_TTS_PROVIDER_ID);
const activeAzureVoice = computed(() => azureVoices.value.find((voice) => voice.shortName === azureSettings.value.voiceId));
const azureStyles = computed(() => activeAzureVoice.value?.styles ?? []);

onMounted(async () => {
  [edgeEnabled.value, systemEnabled.value, volcengineSettings.value, elevenLabsSettings.value, azureSettings.value] = await Promise.all([
    getDefaultConfig(EDGE_ENABLED_KEY, true),
    getDefaultConfig(SYSTEM_ENABLED_KEY, true),
    loadVolcengineTtsSettings(),
    loadElevenLabsTtsSettings(),
    loadAzureTtsSettings(),
  ]);
  const [credentials, hasElevenLabsKey, hasAzureKey] = await Promise.all([
    getVolcengineTtsCredentialStatus(),
    hasElevenLabsTtsApiKey(),
    hasAzureTtsApiKey(),
  ]);
  volcengineAppId.value = credentials.hasAppId ? secretMask : "";
  volcengineAccessKey.value = credentials.hasAccessKey ? secretMask : "";
  elevenLabsApiKey.value = hasElevenLabsKey ? secretMask : "";
  azureApiKey.value = hasAzureKey ? secretMask : "";
  volcengineInitialized.value = true;
  elevenLabsInitialized.value = true;
  azureInitialized.value = true;
  await service.initialize();
});

const persistVolcengineSettings = useDebounceFn(
  () => saveVolcengineTtsSettings(volcengineSettings.value),
  400,
);
const persistVolcengineAppId = useDebounceFn((value: string) => {
  if (value !== secretMask) return saveVolcengineTtsAppId(value);
}, 600);
const persistVolcengineAccessKey = useDebounceFn((value: string) => {
  if (value !== secretMask) return saveVolcengineTtsAccessKey(value);
}, 600);
const persistElevenLabsSettings = useDebounceFn(() => saveElevenLabsTtsSettings(elevenLabsSettings.value), 400);
const persistElevenLabsApiKey = useDebounceFn((value: string) => {
  if (value !== secretMask) return saveElevenLabsTtsApiKey(value);
}, 600);
const persistAzureSettings = useDebounceFn(() => saveAzureTtsSettings(azureSettings.value), 400);
const persistAzureApiKey = useDebounceFn((value: string) => {
  if (value !== secretMask) return saveAzureTtsApiKey(value);
}, 600);

watch(volcengineSettings, () => {
  if (volcengineInitialized.value) void persistVolcengineSettings();
}, { deep: true });
watch(elevenLabsSettings, () => {
  if (elevenLabsInitialized.value) void persistElevenLabsSettings();
}, { deep: true });
watch(azureSettings, () => {
  if (azureInitialized.value) void persistAzureSettings();
}, { deep: true });

onBeforeUnmount(() => {
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
  void stopSystemTts().catch(() => undefined);
});

async function activateProvider(providerId: string) {
  activeServiceId.value = providerId;
  if (![SYSTEM_TTS_SERVICE_ID, "edge-tts", VOLCENGINE_TTS_PROVIDER_ID, ELEVENLABS_TTS_PROVIDER_ID, AZURE_TTS_PROVIDER_ID].includes(providerId)) {
    await service.activateProvider(providerId);
  }
}

async function toggleProvider(providerId: string, enabled: boolean) {
  if (providerId === SYSTEM_TTS_SERVICE_ID) {
    systemEnabled.value = enabled;
    await setDefaultConfig(SYSTEM_ENABLED_KEY, enabled);
    if (!enabled) await stopSystemTts();
    return;
  }
  if (providerId === "edge-tts") {
    edgeEnabled.value = enabled;
    await setDefaultConfig(EDGE_ENABLED_KEY, enabled);
    return;
  }
  if (providerId === VOLCENGINE_TTS_PROVIDER_ID) {
    volcengineSettings.value.enabled = enabled;
    await saveVolcengineTtsSettings(volcengineSettings.value);
    return;
  }
  if (providerId === ELEVENLABS_TTS_PROVIDER_ID) {
    elevenLabsSettings.value.enabled = enabled;
    await saveElevenLabsTtsSettings(elevenLabsSettings.value);
    return;
  }
  if (providerId === AZURE_TTS_PROVIDER_ID) {
    azureSettings.value.enabled = enabled;
    await saveAzureTtsSettings(azureSettings.value);
    return;
  }
  await service.toggleProvider(providerId, enabled);
}

function updateVolcengineAppId(value: string) {
  volcengineAppId.value = value;
  void persistVolcengineAppId(value);
}

function updateVolcengineAccessKey(value: string) {
  volcengineAccessKey.value = value;
  void persistVolcengineAccessKey(value);
}

function updateElevenLabsApiKey(value: string) {
  elevenLabsApiKey.value = value;
  void persistElevenLabsApiKey(value);
}

function updateAzureApiKey(value: string) {
  azureApiKey.value = value;
  void persistAzureApiKey(value);
}

function updateAzureStyle(value: unknown) {
  azureSettings.value.style = value === "__default__" ? "" : String(value ?? "");
}

async function loadElevenLabsCatalog() {
  loadingVoices.value = true;
  try {
    [elevenLabsModels.value, elevenLabsVoices.value] = await Promise.all([
      listElevenLabsModels(elevenLabsSettings.value),
      listElevenLabsVoices(elevenLabsSettings.value),
    ]);
    if (!elevenLabsModels.value.some((model) => model.modelId === elevenLabsSettings.value.modelId)) {
      elevenLabsSettings.value.modelId = elevenLabsModels.value[0]?.modelId ?? elevenLabsSettings.value.modelId;
    }
    if (!elevenLabsVoices.value.some((voice) => voice.voiceId === elevenLabsSettings.value.voiceId)) {
      elevenLabsSettings.value.voiceId = elevenLabsVoices.value[0]?.voiceId ?? "";
    }
    push.success(`已加载 ${elevenLabsModels.value.length} 个模型和 ${elevenLabsVoices.value.length} 个声音`);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "ElevenLabs 目录加载失败");
  } finally {
    loadingVoices.value = false;
  }
}

async function loadAzureVoices() {
  loadingVoices.value = true;
  try {
    azureVoices.value = await listAzureSpeechVoices(azureSettings.value);
    if (!azureVoices.value.some((voice) => voice.shortName === azureSettings.value.voiceId)) {
      azureSettings.value.voiceId = azureVoices.value[0]?.shortName ?? "";
    }
    if (!azureStyles.value.includes(azureSettings.value.style)) azureSettings.value.style = "";
    push.success(`已加载 ${azureVoices.value.length} 个 Azure 声音`);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "Azure 声音列表加载失败");
  } finally {
    loadingVoices.value = false;
  }
}

async function loadSystemVoices() {
  loadingVoices.value = true;
  try {
    const status = await getSystemTtsStatus();
    if (!status.initialized) throw new Error("系统 TTS 引擎尚未初始化。");
    systemVoices.value = await listSystemTtsVoices(systemLanguage.value);
    if (!systemVoices.value.some((voice) => voice.id === systemVoice.value)) {
      systemVoice.value = systemVoices.value[0]?.id ?? "";
    }
    push.success(`已加载 ${systemVoices.value.length} 个系统声音`);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "系统声音列表加载失败");
  } finally {
    loadingVoices.value = false;
  }
}

async function previewSystemVoice() {
  if (!systemVoice.value) return;
  try {
    await previewSystemTtsVoice(systemVoice.value, text.value);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "声音预览失败");
  }
}

async function stopSystemSpeech() {
  try {
    await stopSystemTts();
  } catch (error) {
    push.error(error instanceof Error ? error.message : "停止系统 TTS 失败");
  }
}

async function loadVoices() {
  loadingVoices.value = true;
  try {
    const result = await listTextToSpeechVoices();
    voices.value = result
      .map((voice) => ({ value: voice.shortName, label: `${voice.locale} · ${voice.shortName} · ${voice.gender}` }))
      .sort((left, right) => left.label.localeCompare(right.label));
    push.success(`已加载 ${voices.value.length} 个声音`);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "声音列表加载失败");
  } finally {
    loadingVoices.value = false;
  }
}

async function runTest() {
  if (isSystem.value) {
    if (!text.value.trim()) {
      push.warning("请输入需要朗读的文本。");
      return;
    }
    testing.value = true;
    try {
      await speakWithSystemTts({
        text: text.value,
        language: systemLanguage.value.trim() || undefined,
        voiceId: systemVoice.value || undefined,
        rate: Number(systemRate.value),
        pitch: Number(systemPitch.value),
        volume: Number(systemVolume.value),
      });
      push.success("系统 TTS 已开始朗读");
    } catch (error) {
      push.error(error instanceof Error ? error.message : "系统 TTS 朗读失败");
    } finally {
      testing.value = false;
    }
    return;
  }

  const model = isEdge.value
    ? EDGE_TTS_MODEL_REF
    : isElevenLabs.value
      ? createElevenLabsTtsModelRef(elevenLabsSettings.value.modelId)
      : isAzure.value
        ? AZURE_TTS_MODEL_REF
    : isVolcengine.value
      ? createVolcengineTtsModelRef(volcengineSettings.value.resourceId)
      : service.selectedModelRef.value;
  if (!model || !text.value.trim()) {
    push.warning("请输入文本并选择语音模型。");
    return;
  }
  testing.value = true;
  try {
    const result = await generateSpeech({
      model,
      text: text.value.trim(),
      voice: isEdge.value
        ? edgeVoice.value
        : isElevenLabs.value
          ? elevenLabsSettings.value.voiceId || undefined
          : isAzure.value
            ? azureSettings.value.voiceId || undefined
        : isVolcengine.value
          ? volcengineSettings.value.speakerId.trim() || undefined
          : modelVoice.value.trim() || undefined,
      speed: isEdge.value || isVolcengine.value
        ? undefined
        : isElevenLabs.value
          ? elevenLabsSettings.value.speed
          : isAzure.value
            ? azureSettings.value.speed
            : Number(modelSpeed.value),
      providerOptions: isEdge.value
        ? {
            edgeTts: {
              rate: edgeRate.value,
              volume: edgeVolume.value,
              pitch: edgePitch.value,
            },
          }
        : isAzure.value
          ? { azureSpeech: { style: azureSettings.value.style || undefined } }
          : isVolcengine.value
          ? {
              volcengineTts: {
                resourceId: volcengineSettings.value.resourceId,
                speakerId: volcengineSettings.value.speakerId,
                sampleRate: volcengineSettings.value.sampleRate,
                contextText: volcengineContext.value.trim() || undefined,
              },
            }
          : undefined,
    });
    if (audioUrl.value) URL.revokeObjectURL(audioUrl.value);
    audioUrl.value = URL.createObjectURL(new Blob([result.audio.uint8Array], { type: result.audio.mediaType }));
    push.success("语音生成完成");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "语音生成失败");
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <ServiceProviderSettingsLayout
    v-model:enabled-collapsed="enabledCollapsed"
    v-model:disabled-collapsed="disabledCollapsed"
    :providers="providers"
    :active-provider-id="activeServiceId"
    :search="search"
    @update:search="search = $event"
    @select-provider="activateProvider"
    @toggle-provider="toggleProvider"
  >
    <SettingForm v-if="isSystem">
      <SettingFormField
        title="服务边界"
        description="系统 TTS 直接播放语音，不返回音频字节，因此不会冒充 AI SDK generateSpeech 模型。"
      >
        <span class="text-sm text-muted-foreground">原生播放服务</span>
      </SettingFormField>
      <SettingFormField title="声音" description="从当前操作系统读取声音；语言用于按 locale 前缀过滤。">
        <div class="grid w-full gap-2">
          <Input v-model="systemLanguage" placeholder="语言过滤，可选，例如 zh-CN" />
          <div class="flex gap-2 mobile:flex-col">
            <Select v-model="systemVoice">
              <SelectTrigger class="min-w-0 flex-1">
                <SelectValue placeholder="选择系统声音" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="voice in systemVoices" :key="voice.id" :value="voice.id">
                    {{ voice.language }} · {{ voice.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="outline" :disabled="loadingVoices" @click="loadSystemVoices">
              {{ loadingVoices ? "加载中…" : "加载声音列表" }}
            </Button>
            <Button variant="outline" :disabled="!systemVoice" @click="previewSystemVoice">预览</Button>
          </div>
        </div>
      </SettingFormField>
      <SettingFormField title="系统参数" description="范围来自原生插件；不同平台的实际效果可能不同。">
        <div class="grid w-full gap-2 sm:grid-cols-3">
          <Input v-model.number="systemRate" type="number" min="0.1" max="4" step="0.1" aria-label="语速" />
          <Input v-model.number="systemPitch" type="number" min="0.5" max="2" step="0.1" aria-label="音高" />
          <Input v-model.number="systemVolume" type="number" min="0" max="1" step="0.1" aria-label="音量" />
        </div>
      </SettingFormField>
      <SettingFormField title="系统朗读测试" description="直接调用操作系统合成器播放当前文本。">
        <div class="flex gap-2">
          <Button :disabled="testing || !text.trim()" @click="runTest">{{ testing ? "启动中…" : "开始朗读" }}</Button>
          <Button variant="outline" @click="stopSystemSpeech">停止</Button>
        </div>
        <template #bottom>
          <Textarea v-model="text" class="min-h-24 resize-y" placeholder="输入需要朗读的文本" />
        </template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isEdge">
      <SettingFormField title="默认服务" description="未显式传入 model 时，TTS 服务重定向到这里。">
        <Button variant="outline" @click="setSpeechModel(EDGE_TTS_MODEL_REF)">设为默认</Button>
      </SettingFormField>
      <SettingFormField title="声音" description="声音列表按需在线获取，不在启动时阻塞页面。">
        <div class="flex w-full gap-2 mobile:flex-col">
          <Select v-model="edgeVoice">
            <SelectTrigger class="min-w-0 flex-1">
              <SelectValue placeholder="选择声音" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="voice in voices" :key="voice.value" :value="voice.value">{{ voice.label }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" :disabled="loadingVoices" @click="loadVoices">
            {{ loadingVoices ? "加载中…" : "加载声音列表" }}
          </Button>
        </div>
      </SettingFormField>
      <SettingFormField title="Edge 参数" description="这些字段只内联到 Edge adapter，不污染统一 generateSpeech 接口。">
        <div class="grid w-full gap-2 sm:grid-cols-3">
          <Input v-model="edgeRate" aria-label="语速" placeholder="语速 +0%" />
          <Input v-model="edgeVolume" aria-label="音量" placeholder="音量 +0%" />
          <Input v-model="edgePitch" aria-label="音高" placeholder="音高 +0Hz" />
        </div>
      </SettingFormField>
      <SettingFormField title="语音生成测试" description="通过当前服务实际生成并播放语音。">
        <Button :disabled="testing || !text.trim()" @click="runTest">{{ testing ? "生成中…" : "生成语音" }}</Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="text" class="min-h-24 resize-y" placeholder="输入需要朗读的文本" />
            <audio v-if="audioUrl" :src="audioUrl" controls class="w-full" />
          </div>
        </template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isElevenLabs">
      <SettingFormField title="API Key" description="保存在 Secret 数据表中，请求时仅由 Rust 代理写入 xi-api-key。">
        <Input
          :model-value="elevenLabsApiKey"
          type="password"
          placeholder="ElevenLabs API Key"
          @update:model-value="updateElevenLabsApiKey(String($event))"
        />
      </SettingFormField>
      <SettingFormField title="API 地址" description="默认使用 ElevenLabs 官方 HTTPS API，也可配置兼容代理。">
        <Input v-model="elevenLabsSettings.baseUrl" placeholder="https://api.elevenlabs.io" />
      </SettingFormField>
      <SettingFormField title="默认服务" description="未显式传入 model 时重定向到当前 ElevenLabs 模型。">
        <Button
          variant="outline"
          :disabled="!elevenLabsSettings.modelId.trim()"
          @click="setSpeechModel(createElevenLabsTtsModelRef(elevenLabsSettings.modelId))"
        >
          设为默认
        </Button>
      </SettingFormField>
      <SettingFormField title="模型与声音" description="从账户动态获取支持 TTS 的模型与可用声音；加载前也允许直接填写 ID。">
        <div class="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select v-if="elevenLabsModels.length" v-model="elevenLabsSettings.modelId">
            <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="model in elevenLabsModels" :key="model.modelId" :value="model.modelId">
                  {{ model.name }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-else v-model="elevenLabsSettings.modelId" placeholder="Model ID" />
          <Select v-if="elevenLabsVoices.length" v-model="elevenLabsSettings.voiceId">
            <SelectTrigger><SelectValue placeholder="选择声音" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="voice in elevenLabsVoices" :key="voice.voiceId" :value="voice.voiceId">
                  {{ voice.name }}{{ voice.category ? ` · ${voice.category}` : "" }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-else v-model="elevenLabsSettings.voiceId" placeholder="Voice ID" />
          <Button variant="outline" :disabled="loadingVoices" @click="loadElevenLabsCatalog">
            {{ loadingVoices ? "加载中…" : "加载目录" }}
          </Button>
        </div>
      </SettingFormField>
      <SettingFormField title="声音参数" description="参数只内联到 ElevenLabs voice_settings，不进入其他语音服务。">
        <div class="grid w-full gap-2 sm:grid-cols-3">
          <Input v-model.number="elevenLabsSettings.stability" type="number" min="0" max="1" step="0.01" placeholder="Stability" />
          <Input v-model.number="elevenLabsSettings.similarityBoost" type="number" min="0" max="1" step="0.01" placeholder="Similarity" />
          <Input v-model.number="elevenLabsSettings.style" type="number" min="0" max="1" step="0.01" placeholder="Style" />
          <Input v-model.number="elevenLabsSettings.speed" type="number" min="0.7" max="1.2" step="0.01" placeholder="Speed" />
          <Select v-model="elevenLabsSettings.outputFormat">
            <SelectTrigger><SelectValue placeholder="输出格式" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="mp3_44100_128">MP3 44.1 kHz / 128 kbps</SelectItem>
                <SelectItem value="mp3_22050_32">MP3 22.05 kHz / 32 kbps</SelectItem>
                <SelectItem value="opus_48000_64">Opus 48 kHz / 64 kbps</SelectItem>
                <SelectItem value="pcm_24000">PCM 24 kHz</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div class="flex min-h-9 items-center gap-2 rounded-md border px-3">
            <Switch v-model="elevenLabsSettings.speakerBoost" />
            <span class="text-sm">Speaker Boost</span>
          </div>
        </div>
      </SettingFormField>
      <SettingFormField title="语音生成测试" description="通过统一 generateSpeech 接口请求 ElevenLabs 并播放实际返回的音频。">
        <Button
          :disabled="testing || !text.trim() || !elevenLabsSettings.modelId.trim() || !elevenLabsSettings.voiceId.trim()"
          @click="runTest"
        >
          {{ testing ? "生成中…" : "生成语音" }}
        </Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="text" class="min-h-24 resize-y" placeholder="输入需要朗读的文本" />
            <audio v-if="audioUrl" :src="audioUrl" controls class="w-full" />
          </div>
        </template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isAzure">
      <SettingFormField title="订阅密钥" description="保存在 Secret 数据表中，请求时仅由 Rust 代理写入 Ocp-Apim-Subscription-Key。">
        <Input
          :model-value="azureApiKey"
          type="password"
          placeholder="Azure Speech subscription key"
          @update:model-value="updateAzureApiKey(String($event))"
        />
      </SettingFormField>
      <SettingFormField title="区域与声音" description="Region 决定 Azure Speech endpoint；声音列表按当前区域动态获取。">
        <div class="grid w-full gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
          <Input v-model="azureSettings.region" placeholder="Region，例如 eastasia" />
          <Select v-if="azureVoices.length" v-model="azureSettings.voiceId">
            <SelectTrigger><SelectValue placeholder="选择声音" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="voice in azureVoices" :key="voice.shortName" :value="voice.shortName">
                  {{ voice.locale }} · {{ voice.localName }} · {{ voice.gender }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-else v-model="azureSettings.voiceId" placeholder="Voice short name" />
          <Button variant="outline" :disabled="loadingVoices || !azureSettings.region.trim()" @click="loadAzureVoices">
            {{ loadingVoices ? "加载中…" : "加载声音" }}
          </Button>
        </div>
      </SettingFormField>
      <SettingFormField title="默认服务" description="Azure Speech 使用固定服务引用 azure-speech/standard。">
        <Button variant="outline" @click="setSpeechModel(AZURE_TTS_MODEL_REF)">设为默认</Button>
      </SettingFormField>
      <SettingFormField title="SSML 参数" description="支持当前声音公开的 speaking style，并将统一 speed 映射为 SSML prosody rate。">
        <div class="grid w-full gap-2 sm:grid-cols-3">
          <Select :model-value="azureSettings.style || '__default__'" @update:model-value="updateAzureStyle">
            <SelectTrigger><SelectValue placeholder="Speaking style" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__default__">默认风格</SelectItem>
                <SelectItem v-for="style in azureStyles" :key="style" :value="style">{{ style }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-model.number="azureSettings.speed" type="number" min="0.5" max="2" step="0.05" placeholder="Speed" />
          <Select v-model="azureSettings.outputFormat">
            <SelectTrigger><SelectValue placeholder="输出格式" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="audio-24khz-48kbitrate-mono-mp3">MP3 24 kHz / 48 kbps</SelectItem>
                <SelectItem value="audio-24khz-96kbitrate-mono-mp3">MP3 24 kHz / 96 kbps</SelectItem>
                <SelectItem value="riff-24khz-16bit-mono-pcm">WAV 24 kHz PCM</SelectItem>
                <SelectItem value="webm-24khz-16bit-mono-opus">WebM 24 kHz Opus</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </SettingFormField>
      <SettingFormField title="语音生成测试" description="通过统一 generateSpeech 接口发送 SSML 并播放 Azure 返回的音频。">
        <Button
          :disabled="testing || !text.trim() || !azureSettings.region.trim() || !azureSettings.voiceId.trim()"
          @click="runTest"
        >
          {{ testing ? "生成中…" : "生成语音" }}
        </Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="text" class="min-h-24 resize-y" placeholder="输入需要朗读的文本" />
            <audio v-if="audioUrl" :src="audioUrl" controls class="w-full" />
          </div>
        </template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isVolcengine">
      <SettingFormField title="鉴权" description="APP ID 与 Access Token 保存在 Secret 数据表中，只由 Rust 请求代理替换占位符。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Input
            :model-value="volcengineAppId"
            type="password"
            placeholder="火山引擎 APP ID"
            aria-label="火山引擎 APP ID"
            @update:model-value="updateVolcengineAppId(String($event))"
          />
          <Input
            :model-value="volcengineAccessKey"
            type="password"
            placeholder="火山引擎 Access Token"
            aria-label="火山引擎 Access Token"
            @update:model-value="updateVolcengineAccessKey(String($event))"
          />
        </div>
      </SettingFormField>
      <SettingFormField title="默认服务" description="未显式传入 model 时，TTS 服务重定向到当前 Resource ID。">
        <Button
          variant="outline"
          :disabled="!volcengineSettings.resourceId.trim()"
          @click="setSpeechModel(createVolcengineTtsModelRef(volcengineSettings.resourceId))"
        >
          设为默认
        </Button>
      </SettingFormField>
      <SettingFormField title="服务资源" description="Resource ID 决定已开通的语音资源；Speaker ID 使用控制台音色标识。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Input v-model="volcengineSettings.resourceId" placeholder="Resource ID，例如 seed-tts-2.0" />
          <Input v-model="volcengineSettings.speakerId" placeholder="Speaker ID" />
        </div>
      </SettingFormField>
      <SettingFormField title="合成参数" description="情绪/语气说明会内联为 OpenSpeech additions.context_texts；采样率默认 24000 Hz。">
        <div class="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Input v-model="volcengineContext" placeholder="情绪或语气说明，可选" />
          <Input v-model.number="volcengineSettings.sampleRate" type="number" min="8000" max="48000" step="1000" aria-label="采样率" />
        </div>
      </SettingFormField>
      <SettingFormField title="语音生成测试" description="通过统一 generateSpeech 接口调用 OpenSpeech HTTP Chunked v3 并播放返回的 MP3。">
        <Button
          :disabled="testing || !text.trim() || !volcengineSettings.resourceId.trim() || !volcengineSettings.speakerId.trim()"
          @click="runTest"
        >
          {{ testing ? "生成中…" : "生成语音" }}
        </Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="text" class="min-h-24 resize-y" placeholder="输入需要朗读的文本" />
            <audio v-if="audioUrl" :src="audioUrl" controls class="w-full" />
          </div>
        </template>
      </SettingFormField>
    </SettingForm>

    <ModelCapabilityProviderForm
      v-else-if="service.activeProvider.value"
      :provider="service.activeProvider.value"
      :models="service.models.value"
      :selected-model-id="service.selectedModelId.value"
      :api-key-draft="service.apiKeyDraft.value"
      :has-api-key="service.activeProviderHasKey.value"
      @update:selected-model-id="service.selectedModelId.value = $event"
      @update:api-key="service.updateApiKey"
      @update:base-url="service.store.patchProvider(service.activeProvider.value.id, { baseUrl: $event })"
    >
      <SettingFormField title="默认模型" description="未显式传入 model 时，TTS 服务重定向到这里。">
        <Button variant="outline" :disabled="!service.selectedModelRef.value" @click="setSpeechModel(service.selectedModelRef.value)">
          设为默认
        </Button>
      </SettingFormField>
      <SettingFormField title="语音参数" description="模型提供商可在后续集成中扩展按需字段。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Input v-model="modelVoice" placeholder="Voice ID，例如 alloy" />
          <Input v-model.number="modelSpeed" type="number" min="0.25" max="4" step="0.05" placeholder="Speed" />
        </div>
      </SettingFormField>
      <SettingFormField title="语音生成测试" description="通过当前模型实际生成并播放语音。">
        <Button :disabled="testing || !text.trim()" @click="runTest">{{ testing ? "生成中…" : "生成语音" }}</Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="text" class="min-h-24 resize-y" placeholder="输入需要朗读的文本" />
            <audio v-if="audioUrl" :src="audioUrl" controls class="w-full" />
          </div>
        </template>
      </SettingFormField>
    </ModelCapabilityProviderForm>
  </ServiceProviderSettingsLayout>
</template>
