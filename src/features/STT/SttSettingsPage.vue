<script setup lang="ts">
import { push } from "notivue";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	getDefaultConfig,
	setDefaultConfig,
	setTranscriptionModel,
} from "@/features/defaultConfigs/default-config-service";
import ModelCapabilityProviderForm from "@/features/ModelConnection/components/ModelCapabilityProviderForm.vue";
import ServiceProviderSettingsLayout from "@/features/ModelConnection/components/ServiceProviderSettingsLayout.vue";
import type { ServiceProviderView } from "@/features/ModelConnection/service-provider";
import { useModelCapabilityProviders } from "@/features/ModelConnection/services/use-model-capability-providers";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import {
	deleteWhisperModel,
	downloadWhisperModel,
	listWhisperModels,
	WHISPER_CANDLE_PROVIDER_ID,
	type WhisperModelPack,
} from "./providers/whisper-candle-client";
import { transcribe } from "./speech-to-text";
import {
	getSystemSttAvailability,
	getSystemSttPermission,
	onSystemSttError,
	onSystemSttResult,
	requestSystemSttPermission,
	SYSTEM_STT_SERVICE_ID,
	startSystemStt,
	stopSystemStt,
	supportsSystemStt,
} from "./system-speech-to-text";

const SYSTEM_ENABLED_KEY = "stt.system.enabled";
const service = useModelCapabilityProviders("asr");
const systemSupported = supportsSystemStt();
const search = ref("");
const activeServiceId = ref(
	systemSupported ? SYSTEM_STT_SERVICE_ID : WHISPER_CANDLE_PROVIDER_ID,
);
const systemEnabled = ref(true);
const audio = ref<Uint8Array>();
const audioName = ref("");
const language = ref("");
const transcript = ref("");
const testing = ref(false);
const recording = ref(false);
const permissionStatus = ref("尚未检查");
const whisperModels = ref<WhisperModelPack[]>([]);
const whisperSelectedModelId = ref("");
const whisperDownloading = ref(false);
const whisperForm = reactive({
	id: "",
	version: "",
	url: "",
	sha256: "",
	size: "",
	language: "",
});
let removeResultListener: (() => void) | undefined;
let removeErrorListener: (() => void) | undefined;

const providers = computed<ServiceProviderView[]>(() => [
	...(systemSupported
		? [
				{
					id: SYSTEM_STT_SERVICE_ID,
					name: "系统 STT",
					description:
						"使用 iOS/Android 系统语音识别；桌面 Whisper 路径已拦截。",
					enabled: systemEnabled.value,
					source: "feature" as const,
				},
			]
		: []),
	{
		id: WHISPER_CANDLE_PROVIDER_ID,
		name: "Whisper Candle 本地高质量转写",
		description: "下载并校验 ZIP 模型包，在本机 CPU 上处理 WAV PCM 音频。",
		enabled: true,
		source: "feature" as const,
	},
	...service.providerViews.value,
]);
const isSystem = computed(
	() => activeServiceId.value === SYSTEM_STT_SERVICE_ID,
);
const isWhisper = computed(
	() => activeServiceId.value === WHISPER_CANDLE_PROVIDER_ID,
);
const selectedWhisperModel = computed(() =>
	whisperModels.value.find(
		(model) => model.id === whisperSelectedModelId.value,
	),
);
const whisperStorageBytes = computed(() =>
	whisperModels.value.reduce(
		(total, model) => total + (model.diskSize ?? model.size),
		0,
	),
);

onMounted(async () => {
	systemEnabled.value = await getDefaultConfig(SYSTEM_ENABLED_KEY, true);
	await service.initialize();
	await refreshWhisperModels();
	if (!activeServiceId.value)
		activeServiceId.value = service.providerViews.value[0]?.id ?? "";
});

onBeforeUnmount(() => {
	if (recording.value) void stopSystemStt();
	cleanupSystemListeners();
});

async function activateProvider(providerId: string) {
	activeServiceId.value = providerId;
	if (
		providerId !== SYSTEM_STT_SERVICE_ID &&
		providerId !== WHISPER_CANDLE_PROVIDER_ID
	) {
		await service.activateProvider(providerId);
	}
}

async function toggleProvider(providerId: string, enabled: boolean) {
	if (providerId === SYSTEM_STT_SERVICE_ID) {
		systemEnabled.value = enabled;
		await setDefaultConfig(SYSTEM_ENABLED_KEY, enabled);
		if (!enabled && recording.value) await stopRecording();
		return;
	}
	if (providerId === WHISPER_CANDLE_PROVIDER_ID) return;
	await service.toggleProvider(providerId, enabled);
}

async function refreshWhisperModels() {
	try {
		whisperModels.value = await listWhisperModels();
		if (
			!whisperModels.value.some(
				(model) => model.id === whisperSelectedModelId.value,
			)
		) {
			whisperSelectedModelId.value = whisperModels.value[0]?.id ?? "";
		}
	} catch (error) {
		push.error(
			error instanceof Error ? error.message : "无法读取本地 Whisper 模型包",
		);
	}
}

async function addWhisperModel() {
	const id = whisperForm.id.trim();
	const version = whisperForm.version.trim();
	const url = whisperForm.url.trim();
	const sha256 = whisperForm.sha256.trim();
	const size = Number(whisperForm.size);
	if (
		!id ||
		!version ||
		!url ||
		!sha256 ||
		!Number.isSafeInteger(size) ||
		size <= 0
	) {
		push.warning("请填写模型 ID、版本、下载地址、SHA-256 和准确的字节大小。");
		return;
	}
	whisperDownloading.value = true;
	try {
		const model = await downloadWhisperModel(
			{
				id,
				version,
				sha256,
				size,
				language: whisperForm.language.trim() || undefined,
				runtime: "whisper-candle-core",
			},
			url,
		);
		await refreshWhisperModels();
		whisperSelectedModelId.value = model.id;
		push.success("Whisper 模型已下载并校验。");
	} catch (error) {
		push.error(error instanceof Error ? error.message : "Whisper 模型下载失败");
	} finally {
		whisperDownloading.value = false;
	}
}

async function removeWhisperModel(id: string) {
	try {
		await deleteWhisperModel(id);
		await refreshWhisperModels();
		push.success("Whisper 模型已删除。");
	} catch (error) {
		push.error(error instanceof Error ? error.message : "Whisper 模型删除失败");
	}
}

function formatBytes(size: number) {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanupSystemListeners() {
	removeResultListener?.();
	removeErrorListener?.();
	removeResultListener = undefined;
	removeErrorListener = undefined;
}

async function refreshPermission(request = false) {
	try {
		const permission = request
			? await requestSystemSttPermission()
			: await getSystemSttPermission();
		permissionStatus.value = `麦克风：${permission.microphone}；语音识别：${permission.speechRecognition}`;
		return (
			permission.microphone === "granted" &&
			permission.speechRecognition === "granted"
		);
	} catch (error) {
		permissionStatus.value =
			error instanceof Error ? error.message : "权限检查失败";
		return false;
	}
}

async function startRecording() {
	if (!systemEnabled.value) return;
	transcript.value = "";
	try {
		const availability = await getSystemSttAvailability();
		if (!availability.available)
			throw new Error(availability.reason || "系统语音识别不可用。");
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
	const selectedModel = isWhisper.value
		? selectedWhisperModel.value &&
			`${WHISPER_CANDLE_PROVIDER_ID}/${selectedWhisperModel.value.id}`
		: service.selectedModelRef.value;
	if (!audio.value || !selectedModel) {
		push.warning("请选择音频和转写模型。");
		return;
	}
	testing.value = true;
	transcript.value = "";
	try {
		const providerId =
			typeof selectedModel === "string" ? selectedModel.split("/")[0] : "";
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
        description="仅在 iOS/Android 注册系统识别插件；桌面端请使用独立的 Whisper 本地模型包。"
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

    <SettingForm v-else-if="isWhisper">
      <SettingFormField
        title="本地高质量转写"
        description="ZIP 包经 SHA-256 和大小校验后解压到应用数据目录；当前 CPU 推理只接收 WAV PCM。"
      >
        <span class="text-sm text-muted-foreground">whisper-candle-core / CPU / safetensors</span>
      </SettingFormField>
      <SettingFormField title="下载模型包" description="ZIP 根目录必须包含 config.json 与 model.safetensors；模型文件不会进入应用安装包。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Input v-model="whisperForm.id" placeholder="模型 ID，例如 whisper-base" />
          <Input v-model="whisperForm.version" placeholder="版本，例如 1" />
          <Input v-model="whisperForm.url" class="sm:col-span-2" placeholder="Whisper Candle ZIP 下载 URL" />
          <Input v-model="whisperForm.sha256" class="sm:col-span-2" placeholder="SHA-256（64 位十六进制）" />
          <Input v-model="whisperForm.size" inputmode="numeric" placeholder="文件大小（字节）" />
          <Input v-model="whisperForm.language" placeholder="语言，可选，例如 zh" />
          <Button class="sm:col-span-2" :disabled="whisperDownloading" @click="addWhisperModel">
            {{ whisperDownloading ? "下载并校验中…" : "下载模型包" }}
          </Button>
        </div>
      </SettingFormField>
      <SettingFormField title="已安装模型" :description="`选择一个模型后可设为默认，或删除其本地缓存。当前占用 ${formatBytes(whisperStorageBytes)}。`">
        <div class="flex w-full flex-col gap-2">
          <div v-for="model in whisperModels" :key="model.id" class="flex items-center gap-2 rounded-md border p-2 mobile:flex-wrap">
            <Button
              class="min-w-0 flex-1 justify-start"
              :variant="whisperSelectedModelId === model.id ? 'secondary' : 'outline'"
              @click="whisperSelectedModelId = model.id"
            >
              {{ model.id }} · {{ model.version }}<span v-if="model.language"> · {{ model.language }}</span>
            </Button>
            <Button variant="outline" @click="setTranscriptionModel(`${WHISPER_CANDLE_PROVIDER_ID}/${model.id}`)">设为默认</Button>
            <Button variant="destructive" @click="removeWhisperModel(model.id)">删除</Button>
          </div>
          <span v-if="!whisperModels.length" class="text-sm text-muted-foreground">尚未下载模型包。</span>
        </div>
      </SettingFormField>
      <SettingFormField title="转写测试" description="上传 WAV PCM 文件，以选中的本地模型生成文字。">
        <div class="flex w-full flex-col gap-2 sm:items-end">
          <Input type="file" accept="audio/wav,.wav" @change="selectAudio" />
          <Input v-model="language" placeholder="语言代码，可选，例如 zh" />
          <span v-if="audioName" class="text-xs text-muted-foreground">{{ audioName }}</span>
          <Button :disabled="testing || !audio || !selectedWhisperModel" @click="runTest">{{ testing ? "转写中…" : "生成文字" }}</Button>
        </div>
        <template #bottom>
          <Textarea :model-value="transcript" readonly class="min-h-28 resize-y" placeholder="转写结果会显示在这里" />
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
