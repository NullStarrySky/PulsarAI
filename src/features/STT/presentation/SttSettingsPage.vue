<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import ModelCapabilityProviderForm from "@/features/ModelConnection/presentation/ModelCapabilityProviderForm.vue";
import ServiceProviderSettingsLayout from "@/features/ModelConnection/presentation/ServiceProviderSettingsLayout.vue";
import { useModelCapabilityProviders } from "@/features/ModelConnection/application/use-model-capability-providers";
import type { ServiceProviderView } from "@/features/ModelConnection/domain/service-provider";
import { getDefaultConfig, setDefaultConfig } from "@/features/defaultConfigs/application/default-config-service";
import { setTranscriptionModel } from "@/features/defaultConfigs/application/default-config-service";
import { transcribe } from "../application/speech-to-text";
import {
  SYSTEM_STT_SERVICE_ID,
  getSystemSttAvailability,
  getSystemSttPermission,
  onSystemSttError,
  onSystemSttResult,
  requestSystemSttPermission,
  startSystemStt,
  stopSystemStt,
  supportsSystemStt,
} from "../application/system-speech-to-text";

const SYSTEM_ENABLED_KEY = "stt.system.enabled";
const service = useModelCapabilityProviders("asr");
const systemSupported = supportsSystemStt();
const search = ref("");
const activeServiceId = ref(systemSupported ? SYSTEM_STT_SERVICE_ID : "");
const enabledCollapsed = ref(false);
const disabledCollapsed = ref(false);
const systemEnabled = ref(true);
const audio = ref<Uint8Array>();
const audioName = ref("");
const language = ref("");
const transcript = ref("");
const testing = ref(false);
const recording = ref(false);
const permissionStatus = ref("尚未检查");
let removeResultListener: (() => void) | undefined;
let removeErrorListener: (() => void) | undefined;

const providers = computed<ServiceProviderView[]>(() => [
  ...(systemSupported
    ? [{
        id: SYSTEM_STT_SERVICE_ID,
        name: "系统 STT",
        description: "使用 iOS/Android 系统语音识别；桌面 Whisper 路径已拦截。",
        enabled: systemEnabled.value,
        source: "feature" as const,
      }]
    : []),
  ...service.providerViews.value,
]);
const isSystem = computed(() => activeServiceId.value === SYSTEM_STT_SERVICE_ID);

onMounted(async () => {
  systemEnabled.value = await getDefaultConfig(SYSTEM_ENABLED_KEY, true);
  await service.initialize();
  if (!activeServiceId.value) activeServiceId.value = service.providerViews.value[0]?.id ?? "";
});

onBeforeUnmount(() => {
  if (recording.value) void stopSystemStt();
  cleanupSystemListeners();
});

async function activateProvider(providerId: string) {
  activeServiceId.value = providerId;
  if (providerId !== SYSTEM_STT_SERVICE_ID) await service.activateProvider(providerId);
}

async function toggleProvider(providerId: string, enabled: boolean) {
  if (providerId === SYSTEM_STT_SERVICE_ID) {
    systemEnabled.value = enabled;
    await setDefaultConfig(SYSTEM_ENABLED_KEY, enabled);
    if (!enabled && recording.value) await stopRecording();
    return;
  }
  await service.toggleProvider(providerId, enabled);
}

function cleanupSystemListeners() {
  removeResultListener?.();
  removeErrorListener?.();
  removeResultListener = undefined;
  removeErrorListener = undefined;
}

async function refreshPermission(request = false) {
  try {
    const permission = request ? await requestSystemSttPermission() : await getSystemSttPermission();
    permissionStatus.value = `麦克风：${permission.microphone}；语音识别：${permission.speechRecognition}`;
    return permission.microphone === "granted" && permission.speechRecognition === "granted";
  } catch (error) {
    permissionStatus.value = error instanceof Error ? error.message : "权限检查失败";
    return false;
  }
}

async function startRecording() {
  if (!systemEnabled.value) return;
  transcript.value = "";
  try {
    const availability = await getSystemSttAvailability();
    if (!availability.available) throw new Error(availability.reason || "系统语音识别不可用。");
    if (!(await refreshPermission(false)) && !(await refreshPermission(true))) {
      throw new Error("系统语音识别权限未授予。");
    }
    cleanupSystemListeners();
    removeResultListener = await onSystemSttResult((result) => {
      transcript.value = result.transcript;
      if (result.isFinal) {
        recording.value = false;
        cleanupSystemListeners();
      }
    });
    removeErrorListener = await onSystemSttError((error) => {
      recording.value = false;
      transcript.value = `${error.code}: ${error.message}`;
      cleanupSystemListeners();
      push.error(error.message);
    });
    await startSystemStt({
      language: language.value.trim() || undefined,
      maxDuration: 60_000,
      onDevice: true,
    });
    recording.value = true;
  } catch (error) {
    cleanupSystemListeners();
    push.error(error instanceof Error ? error.message : "系统语音识别启动失败");
  }
}

async function stopRecording() {
  try {
    await stopSystemStt();
  } catch (error) {
    push.error(error instanceof Error ? error.message : "停止识别失败");
  } finally {
    recording.value = false;
    cleanupSystemListeners();
  }
}

async function selectAudio(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  audio.value = new Uint8Array(await file.arrayBuffer());
  audioName.value = file.name;
}

async function runTest() {
  if (!audio.value || !service.selectedModelRef.value) {
    push.warning("请选择音频和转写模型。");
    return;
  }
  testing.value = true;
  transcript.value = "";
  try {
    const selectedModel = service.selectedModelRef.value;
    const providerId = typeof selectedModel === "string"
      ? selectedModel.split("/")[0]
      : "";
    const requestedLanguage = language.value.trim();
    const result = await transcribe({
      model: selectedModel,
      audio: audio.value,
      ...(requestedLanguage && providerId
        ? { providerOptions: { [providerId]: { language: requestedLanguage } } }
        : {}),
    });
    transcript.value = result.text;
    push.success("语音转写完成");
  } catch (error) {
    transcript.value = error instanceof Error ? error.message : "语音转写失败";
    push.error("语音转写失败");
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
        title="平台范围"
        description="仅在 iOS/Android 注册系统识别插件；桌面端 Whisper 本地模型不会编译或展示。"
      >
        <span class="text-sm text-muted-foreground">移动端系统服务</span>
      </SettingFormField>
      <SettingFormField title="识别权限" description="系统 STT 同时需要麦克风和语音识别权限。">
        <div class="flex w-full items-center justify-between gap-3 mobile:flex-col mobile:items-stretch">
          <span class="text-sm text-muted-foreground">{{ permissionStatus }}</span>
          <div class="flex gap-2">
            <Button variant="outline" @click="refreshPermission(false)">检查权限</Button>
            <Button variant="outline" @click="refreshPermission(true)">请求权限</Button>
          </div>
        </div>
      </SettingFormField>
      <SettingFormField title="识别参数" description="默认优先使用端侧系统识别，单次录音最长 60 秒。">
        <Input v-model="language" placeholder="语言代码，可选，例如 zh-CN" />
      </SettingFormField>
      <SettingFormField title="系统识别测试" description="按下开始后说话，停止时生成最终文字。">
        <div class="flex gap-2">
          <Button v-if="!recording" :disabled="!systemEnabled" @click="startRecording">开始识别</Button>
          <Button v-else variant="destructive" @click="stopRecording">停止并生成文字</Button>
        </div>
        <template #bottom>
          <Textarea :model-value="transcript" readonly class="min-h-28 resize-y" placeholder="系统识别结果会显示在这里" />
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
      <SettingFormField title="默认模型" description="未显式传入 model 时，STT 服务重定向到这里。">
        <Button variant="outline" :disabled="!service.selectedModelRef.value" @click="setTranscriptionModel(service.selectedModelRef.value)">
          设为默认
        </Button>
      </SettingFormField>
      <SettingFormField title="转写参数" description="参数表单按提供商需要扩展，不要求固定字段。">
        <Input v-model="language" placeholder="语言代码，可选，例如 zh" />
      </SettingFormField>
      <SettingFormField title="转写测试" description="上传音频并通过当前模型生成文字。">
        <div class="flex w-full flex-col gap-2 sm:items-end">
          <Input type="file" accept="audio/*" @change="selectAudio" />
          <span v-if="audioName" class="text-xs text-muted-foreground">{{ audioName }}</span>
          <Button :disabled="testing || !audio" @click="runTest">{{ testing ? "转写中…" : "生成文字" }}</Button>
        </div>
        <template #bottom>
          <Textarea :model-value="transcript" readonly class="min-h-28 resize-y" placeholder="转写结果会显示在这里" />
        </template>
      </SettingFormField>
    </ModelCapabilityProviderForm>
  </ServiceProviderSettingsLayout>
</template>
