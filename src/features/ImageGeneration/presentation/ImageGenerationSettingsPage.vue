<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import ModelCapabilityProviderForm from "@/features/ModelConnection/presentation/ModelCapabilityProviderForm.vue";
import ServiceProviderSettingsLayout from "@/features/ModelConnection/presentation/ServiceProviderSettingsLayout.vue";
import { useModelCapabilityProviders } from "@/features/ModelConnection/application/use-model-capability-providers";
import type { ServiceProviderView } from "@/features/ModelConnection/domain/service-provider";
import { setImageModel } from "@/features/defaultConfigs/application/default-config-service";
import { generateImage } from "../application/image-generation";
import { hasAutomatic1111Auth, loadAutomatic1111Settings, saveAutomatic1111Auth, saveAutomatic1111Settings } from "../application/automatic1111-settings";
import { hasComfyUIRunPodApiKey, loadComfyUISettings, saveComfyUIRunPodApiKey, saveComfyUISettings } from "../application/comfyui-settings";
import {
  hasNovelAIApiKey,
  loadNovelAISettings,
  saveNovelAIApiKey,
  saveNovelAISettings,
} from "../application/novelai-settings";
import { hasStabilityApiKey, loadStabilitySettings, saveStabilityApiKey, saveStabilitySettings } from "../application/stability-settings";
import {
  AUTOMATIC1111_MODEL_REF,
  AUTOMATIC1111_PROVIDER_ID,
  COMFYUI_MODEL_REF,
  COMFYUI_PROVIDER_ID,
  createDefaultAutomatic1111Settings,
  createDefaultComfyUISettings,
  createDefaultNovelAISettings,
  createDefaultStabilitySettings,
  NOVELAI_MODELS,
  NOVELAI_PROVIDER_ID,
  NOVELAI_SAMPLERS,
  STABILITY_MODELS,
  STABILITY_PROVIDER_ID,
} from "../domain/image-generation";
import { testAutomatic1111Connection } from "../infrastructure/automatic1111-image-client";
import { buildComfyUIBaseUrl, testComfyUIConnection } from "../infrastructure/comfyui-image-client";

const apiKeyMask = "••••••••";
const service = useModelCapabilityProviders("image");
const search = ref("");
const activeServiceId = ref(COMFYUI_PROVIDER_ID);
const enabledCollapsed = ref(false);
const disabledCollapsed = ref(false);
const novelAISettings = ref(createDefaultNovelAISettings());
const novelAIApiKey = ref("");
const novelAIInitialized = ref(false);
const comfyUISettings = ref(createDefaultComfyUISettings());
const comfyUIInitialized = ref(false);
const comfyUICheckpoints = ref<string[]>([]);
const comfyUIConnecting = ref(false);
const comfyUIConnectionStatus = ref("");
const comfyUIRunPodApiKey = ref("");
const automatic1111Settings = ref(createDefaultAutomatic1111Settings());
const automatic1111Auth = ref("");
const automatic1111Models = ref<string[]>([]);
const automatic1111Samplers = ref<string[]>([]);
const automatic1111Schedulers = ref<string[]>([]);
const automatic1111Status = ref("");
const stabilitySettings = ref(createDefaultStabilitySettings());
const stabilityApiKey = ref("");
const prompt = ref("一颗漂浮在深空中的发光行星，电影感光照");
const resultUrl = ref("");
const testing = ref(false);

const providers = computed<ServiceProviderView[]>(() => [
  {
    id: AUTOMATIC1111_PROVIDER_ID,
    name: "AUTOMATIC1111 / Forge",
    description: "连接本机或局域网 Stable Diffusion WebUI API。",
    enabled: automatic1111Settings.value.enabled,
    source: "feature",
  },
  {
    id: NOVELAI_PROVIDER_ID,
    name: "NovelAI",
    description: "远程专用图片生成服务，不作为通用模型平台注册。",
    enabled: novelAISettings.value.enabled,
    source: "feature",
  },
  {
    id: STABILITY_PROVIDER_ID,
    name: "Stability AI",
    description: "Stability 官方 Stable Image API 专用图片服务。",
    enabled: stabilitySettings.value.enabled,
    source: "feature",
  },
  {
    id: COMFYUI_PROVIDER_ID,
    name: "ComfyUI",
    description: "连接本机或局域网 ComfyUI 的工作流图片服务。",
    enabled: comfyUISettings.value.enabled,
    source: "feature",
  },
  ...service.providerViews.value,
]);
const isNovelAI = computed(() => activeServiceId.value === NOVELAI_PROVIDER_ID);
const isComfyUI = computed(() => activeServiceId.value === COMFYUI_PROVIDER_ID);
const isAutomatic1111 = computed(() => activeServiceId.value === AUTOMATIC1111_PROVIDER_ID);
const isStability = computed(() => activeServiceId.value === STABILITY_PROVIDER_ID);
const comfyUIAddress = computed(() => {
  try {
    return buildComfyUIBaseUrl(comfyUISettings.value);
  } catch {
    return "地址配置无效";
  }
});
const comfyUISamplers = ["euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2s_ancestral"];
const comfyUISchedulers = ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform", "beta"];

onMounted(async () => {
  [novelAISettings.value, comfyUISettings.value, automatic1111Settings.value, stabilitySettings.value] = await Promise.all([
    loadNovelAISettings(),
    loadComfyUISettings(),
    loadAutomatic1111Settings(),
    loadStabilitySettings(),
  ]);
  novelAIApiKey.value = await hasNovelAIApiKey() ? apiKeyMask : "";
  comfyUIRunPodApiKey.value = await hasComfyUIRunPodApiKey() ? apiKeyMask : "";
  automatic1111Auth.value = await hasAutomatic1111Auth() ? apiKeyMask : "";
  stabilityApiKey.value = await hasStabilityApiKey() ? apiKeyMask : "";
  novelAIInitialized.value = true;
  comfyUIInitialized.value = true;
  await service.initialize();
});

const persistNovelAISettings = useDebounceFn(() => saveNovelAISettings(novelAISettings.value), 400);
const persistNovelAIApiKey = useDebounceFn(async (value: string) => {
  if (value === apiKeyMask) return;
  await saveNovelAIApiKey(value);
}, 600);
const persistComfyUISettings = useDebounceFn(() => saveComfyUISettings(comfyUISettings.value), 400);
const persistAutomatic1111Settings = useDebounceFn(() => saveAutomatic1111Settings(automatic1111Settings.value), 400);
const persistStabilitySettings = useDebounceFn(() => saveStabilitySettings(stabilitySettings.value), 400);

watch(novelAISettings, () => {
  if (novelAIInitialized.value) void persistNovelAISettings();
}, { deep: true });
watch(comfyUISettings, () => {
  if (comfyUIInitialized.value) void persistComfyUISettings();
}, { deep: true });
watch(automatic1111Settings, () => void persistAutomatic1111Settings(), { deep: true });
watch(stabilitySettings, () => void persistStabilitySettings(), { deep: true });

async function activateProvider(providerId: string) {
  activeServiceId.value = providerId;
  if (![NOVELAI_PROVIDER_ID, COMFYUI_PROVIDER_ID, AUTOMATIC1111_PROVIDER_ID, STABILITY_PROVIDER_ID].includes(providerId)) {
    await service.activateProvider(providerId);
  }
}

async function toggleProvider(providerId: string, enabled: boolean) {
  if (providerId === NOVELAI_PROVIDER_ID) {
    novelAISettings.value.enabled = enabled;
    await saveNovelAISettings(novelAISettings.value);
    return;
  }
  if (providerId === COMFYUI_PROVIDER_ID) {
    comfyUISettings.value.enabled = enabled;
    await saveComfyUISettings(comfyUISettings.value);
    return;
  }
  if (providerId === AUTOMATIC1111_PROVIDER_ID) {
    automatic1111Settings.value.enabled = enabled;
    await saveAutomatic1111Settings(automatic1111Settings.value);
    return;
  }
  if (providerId === STABILITY_PROVIDER_ID) {
    stabilitySettings.value.enabled = enabled;
    await saveStabilitySettings(stabilitySettings.value);
    return;
  }
  await service.toggleProvider(providerId, enabled);
}

function updateNovelAIApiKey(value: string) {
  novelAIApiKey.value = value;
  void persistNovelAIApiKey(value);
}

function updateRunPodApiKey(value: string) {
  comfyUIRunPodApiKey.value = value;
  if (value !== apiKeyMask) void saveComfyUIRunPodApiKey(value);
}

function updateAutomatic1111Auth(value: string) {
  automatic1111Auth.value = value;
  if (value === apiKeyMask) return;
  const separator = value.indexOf(":");
  void saveAutomatic1111Auth(separator >= 0 ? value.slice(0, separator) : value, separator >= 0 ? value.slice(separator + 1) : "");
}

function updateStabilityApiKey(value: string) {
  stabilityApiKey.value = value;
  if (value !== apiKeyMask) void saveStabilityApiKey(value);
}

function updateNovelAISeed(value: string | number) {
  const normalized = String(value).trim();
  novelAISettings.value.seed = normalized ? Number(normalized) : null;
}

async function testComfyUI() {
  comfyUIConnecting.value = true;
  comfyUIConnectionStatus.value = `正在连接 ${comfyUIAddress.value}…`;
  try {
    const result = await testComfyUIConnection(comfyUISettings.value);
    comfyUICheckpoints.value = result.checkpoints;
    if (!comfyUISettings.value.checkpoint && result.checkpoints[0]) {
      comfyUISettings.value.checkpoint = result.checkpoints[0];
    }
    comfyUIConnectionStatus.value = "readyWorkers" in result
      ? `连接成功，${result.readyWorkers} 个 worker 就绪。`
      : result.checkpoints.length
      ? `连接成功，发现 ${result.checkpoints.length} 个 checkpoint。`
      : "连接成功，但没有发现 checkpoint。";
    push.success("ComfyUI 连接成功");
  } catch (error) {
    comfyUIConnectionStatus.value = error instanceof Error ? error.message : "ComfyUI 连接失败";
    push.error(comfyUIConnectionStatus.value);
  } finally {
    comfyUIConnecting.value = false;
  }
}

async function testAutomatic1111() {
  automatic1111Status.value = "正在连接…";
  try {
    const result = await testAutomatic1111Connection(automatic1111Settings.value, Boolean(automatic1111Auth.value));
    automatic1111Models.value = result.models;
    automatic1111Samplers.value = result.samplers;
    automatic1111Schedulers.value = result.schedulers;
    if (!automatic1111Settings.value.model) automatic1111Settings.value.model = result.activeModel || result.models[0] || "";
    automatic1111Status.value = `连接成功，发现 ${result.models.length} 个模型。`;
    push.success("A1111 连接成功");
  } catch (error) {
    automatic1111Status.value = error instanceof Error ? error.message : "A1111 连接失败";
    push.error(automatic1111Status.value);
  }
}

async function runTest() {
  const model = isComfyUI.value
    ? COMFYUI_MODEL_REF
    : isAutomatic1111.value
      ? AUTOMATIC1111_MODEL_REF
      : isStability.value
        ? `${STABILITY_PROVIDER_ID}/${stabilitySettings.value.model}`
    : isNovelAI.value
      ? `${NOVELAI_PROVIDER_ID}/${novelAISettings.value.model}`
      : service.selectedModelRef.value;
  if (!prompt.value.trim() || !model) {
    push.warning("请输入提示词并选择图片模型。");
    return;
  }
  testing.value = true;
  resultUrl.value = "";
  try {
    if (isComfyUI.value) await saveComfyUISettings(comfyUISettings.value);
    if (isAutomatic1111.value) await saveAutomatic1111Settings(automatic1111Settings.value);
    if (isStability.value) {
      await saveStabilitySettings(stabilitySettings.value);
      if (stabilityApiKey.value !== apiKeyMask) await saveStabilityApiKey(stabilityApiKey.value);
    }
    if (isNovelAI.value) {
      await saveNovelAISettings(novelAISettings.value);
      if (novelAIApiKey.value !== apiKeyMask) await saveNovelAIApiKey(novelAIApiKey.value);
    }
    const result = await generateImage({
      model,
      prompt: prompt.value.trim(),
    });
    resultUrl.value = `data:${result.image.mediaType};base64,${result.image.base64}`;
    push.success("图片生成完成");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "图片生成失败");
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
    <SettingForm v-if="isComfyUI">
      <SettingFormField title="服务类型" description="标准模式连接本地或局域网端口；RunPod 模式连接 Serverless ComfyUI Endpoint。">
        <Select v-model="comfyUISettings.serverType">
          <SelectTrigger class="w-full sm:w-80"><SelectValue placeholder="选择服务类型" /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="standard">标准 ComfyUI</SelectItem><SelectItem value="runpod">RunPod Serverless</SelectItem></SelectGroup></SelectContent>
        </Select>
      </SettingFormField>

      <SettingFormField v-if="comfyUISettings.serverType === 'standard'" title="本地连接" description="默认连接本机 127.0.0.1:8188，也可以填写局域网中的 ComfyUI 主机。">
        <div class="grid w-full gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_8rem_auto]">
          <Select v-model="comfyUISettings.protocol">
            <SelectTrigger><SelectValue placeholder="协议" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-model="comfyUISettings.host" aria-label="ComfyUI 主机" placeholder="127.0.0.1" />
          <Input v-model.number="comfyUISettings.port" type="number" min="1" max="65535" aria-label="ComfyUI 端口" />
          <Button variant="outline" :disabled="comfyUIConnecting" @click="testComfyUI">
            {{ comfyUIConnecting ? "测试中…" : "测试端口" }}
          </Button>
        </div>
        <template #bottom>
          <p class="text-xs text-muted-foreground">{{ comfyUIAddress }} · {{ comfyUIConnectionStatus || "尚未测试连接" }}</p>
        </template>
      </SettingFormField>

      <SettingFormField v-else title="RunPod Endpoint" description="填写完整 Endpoint URL 和 API Key；端口测试会请求 /health 并报告就绪 worker。">
        <div class="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input v-model="comfyUISettings.runpodEndpointUrl" placeholder="https://api.runpod.ai/v2/endpoint-id" />
          <Button variant="outline" :disabled="comfyUIConnecting" @click="testComfyUI">{{ comfyUIConnecting ? "测试中…" : "测试 Endpoint" }}</Button>
          <Input :model-value="comfyUIRunPodApiKey" type="password" class="sm:col-span-2" placeholder="RunPod API Key" @update:model-value="updateRunPodApiKey(String($event))" />
        </div>
        <template #bottom><p class="text-xs text-muted-foreground">{{ comfyUIConnectionStatus || "尚未测试连接" }}</p></template>
      </SettingFormField>

      <SettingFormField title="默认服务" description="将 ImageGeneration 的默认图片引用设为 comfyui/workflow。">
        <Button variant="outline" @click="setImageModel(COMFYUI_MODEL_REF)">设为默认</Button>
      </SettingFormField>

      <SettingFormField title="工作流模式" description="基础模式仅使用 ComfyUI 核心节点；自定义模式接受导出的 API-format JSON。">
        <Select v-model="comfyUISettings.workflowMode">
          <SelectTrigger class="w-full sm:w-80"><SelectValue placeholder="选择工作流模式" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="basic">基础文生图</SelectItem>
              <SelectItem value="custom">自定义 API 工作流</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </SettingFormField>

      <template v-if="comfyUISettings.workflowMode === 'basic'">
        <SettingFormField title="Checkpoint" description="端口测试会读取 CheckpointLoaderSimple 的可用模型列表，也可以手动填写文件名。">
          <div class="flex w-full gap-2 mobile:flex-col">
            <Select v-if="comfyUICheckpoints.length" v-model="comfyUISettings.checkpoint">
              <SelectTrigger class="min-w-0 flex-1"><SelectValue placeholder="选择 checkpoint" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="checkpoint in comfyUICheckpoints" :key="checkpoint" :value="checkpoint">{{ checkpoint }}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Input v-else v-model="comfyUISettings.checkpoint" placeholder="checkpoint.safetensors" />
            <Button variant="outline" :disabled="comfyUIConnecting" @click="testComfyUI">刷新列表</Button>
          </div>
        </SettingFormField>

        <SettingFormField title="画布" description="基础工作流的 EmptyLatentImage 尺寸与批量数由统一生成参数写入。">
          <div class="grid w-full gap-2 sm:grid-cols-2">
            <Input v-model.number="comfyUISettings.width" type="number" min="64" max="4096" step="8" aria-label="宽度" />
            <Input v-model.number="comfyUISettings.height" type="number" min="64" max="4096" step="8" aria-label="高度" />
          </div>
        </SettingFormField>

        <SettingFormField title="采样参数" description="写入基础工作流的 KSampler 节点。">
          <div class="grid w-full gap-2 sm:grid-cols-2">
            <Select v-model="comfyUISettings.sampler">
              <SelectTrigger><SelectValue placeholder="采样器" /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem v-for="sampler in comfyUISamplers" :key="sampler" :value="sampler">{{ sampler }}</SelectItem></SelectGroup></SelectContent>
            </Select>
            <Select v-model="comfyUISettings.scheduler">
              <SelectTrigger><SelectValue placeholder="调度器" /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem v-for="scheduler in comfyUISchedulers" :key="scheduler" :value="scheduler">{{ scheduler }}</SelectItem></SelectGroup></SelectContent>
            </Select>
            <Input v-model.number="comfyUISettings.steps" type="number" min="1" max="200" step="1" placeholder="Steps" />
            <Input v-model.number="comfyUISettings.cfg" type="number" min="0" max="100" step="0.1" placeholder="CFG" />
          </div>
        </SettingFormField>
      </template>

      <SettingFormField v-else title="API 工作流 JSON" description="支持迁移项目的 cosmosVision 元数据、Pulsar 元数据或提示词占位符。">
        <Textarea v-model="comfyUISettings.workflowJson" class="min-h-72 resize-y font-mono text-xs" placeholder="粘贴 Save (API Format) 导出的工作流 JSON" />
        <template #bottom>
          <p v-pre class="text-xs text-muted-foreground">占位符：{{prompt}}、{{negativePrompt}}、{{seed}}、{{width}}、{{height}}</p>
        </template>
      </SettingFormField>

      <SettingFormField title="负向提示词" description="基础模式写入负向 CLIPTextEncode；自定义模式写入绑定或占位符。">
        <Textarea v-model="comfyUISettings.negativePrompt" class="min-h-20 resize-y" placeholder="不希望出现的内容" />
      </SettingFormField>

      <SettingFormField title="超时" description="从提交工作流到取得图片的最长等待时间。">
        <Input v-model.number="comfyUISettings.timeoutSeconds" class="w-full sm:w-48" type="number" min="5" max="3600" step="1" />
      </SettingFormField>

      <SettingFormField title="图片生成测试" description="提交工作流、轮询历史记录并下载实际输出图片。">
        <Button :disabled="testing || !prompt.trim()" @click="runTest">{{ testing ? "生成中…" : "生成图片" }}</Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="prompt" class="min-h-24 resize-y" placeholder="输入图片提示词" />
            <img v-if="resultUrl" :src="resultUrl" alt="ComfyUI 图片生成测试结果" class="max-h-[32rem] w-full rounded-lg border object-contain" />
          </div>
        </template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isAutomatic1111">
      <SettingFormField title="WebUI API 连接" description="默认连接 127.0.0.1:7860；需要启动 WebUI 的 --api，远程访问请自行限制网络边界。">
        <div class="grid w-full gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_8rem_auto]">
          <Select v-model="automatic1111Settings.protocol"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="http">HTTP</SelectItem><SelectItem value="https">HTTPS</SelectItem></SelectGroup></SelectContent></Select>
          <Input v-model="automatic1111Settings.host" placeholder="127.0.0.1" />
          <Input v-model.number="automatic1111Settings.port" type="number" min="1" max="65535" />
          <Button variant="outline" @click="testAutomatic1111">测试端口</Button>
        </div>
        <template #bottom><p class="text-xs text-muted-foreground">{{ automatic1111Status || "尚未测试连接" }}</p></template>
      </SettingFormField>
      <SettingFormField title="Basic Auth" description="若 WebUI 使用 --api-auth，请按 username:password 输入；凭据以 Base64 形式存入 Secret。">
        <Input :model-value="automatic1111Auth" type="password" placeholder="username:password（可选）" @update:model-value="updateAutomatic1111Auth(String($event))" />
      </SettingFormField>
      <SettingFormField title="默认服务" description="将默认图片引用设为 automatic1111/txt2img。"><Button variant="outline" @click="setImageModel(AUTOMATIC1111_MODEL_REF)">设为默认</Button></SettingFormField>
      <SettingFormField title="模型" description="连接测试读取 sd-models；生成时通过 override_settings 临时选择，不永久切换 WebUI 全局模型。">
        <Select v-if="automatic1111Models.length" v-model="automatic1111Settings.model"><SelectTrigger class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="model in automatic1111Models" :key="model" :value="model">{{ model }}</SelectItem></SelectGroup></SelectContent></Select>
        <Input v-else v-model="automatic1111Settings.model" placeholder="模型标题（可留空使用当前模型）" />
      </SettingFormField>
      <SettingFormField title="画布与采样" description="参数直接发送到 /sdapi/v1/txt2img，兼容 AUTOMATIC1111 与 Forge。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Input v-model.number="automatic1111Settings.width" type="number" min="64" max="4096" step="8" placeholder="宽度" />
          <Input v-model.number="automatic1111Settings.height" type="number" min="64" max="4096" step="8" placeholder="高度" />
          <Select v-model="automatic1111Settings.sampler"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="item in (automatic1111Samplers.length ? automatic1111Samplers : ['Euler a', 'Euler', 'DPM++ 2M'])" :key="item" :value="item">{{ item }}</SelectItem></SelectGroup></SelectContent></Select>
          <Select v-model="automatic1111Settings.scheduler"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="item in (automatic1111Schedulers.length ? automatic1111Schedulers : ['Automatic', 'Karras', 'Exponential'])" :key="item" :value="item">{{ item }}</SelectItem></SelectGroup></SelectContent></Select>
          <Input v-model.number="automatic1111Settings.steps" type="number" min="1" max="200" placeholder="Steps" />
          <Input v-model.number="automatic1111Settings.cfg" type="number" min="0" max="100" step="0.1" placeholder="CFG" />
        </div>
      </SettingFormField>
      <SettingFormField title="负向提示词" description="作为 negative_prompt 随请求发送。"><Textarea v-model="automatic1111Settings.negativePrompt" class="min-h-20 resize-y" /></SettingFormField>
      <SettingFormField title="图片生成测试" description="实际调用 txt2img；取消时调用 /sdapi/v1/interrupt。">
        <Button :disabled="testing || !prompt.trim()" @click="runTest">{{ testing ? "生成中…" : "生成图片" }}</Button>
        <template #bottom><div class="grid gap-3"><Textarea v-model="prompt" class="min-h-24 resize-y" /><img v-if="resultUrl" :src="resultUrl" alt="A1111 图片生成测试结果" class="max-h-[32rem] w-full rounded-lg border object-contain" /></div></template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isStability">
      <SettingFormField title="API Key" description="保存在 Secret 中，通过模型代理注入 Stability 请求。"><Input :model-value="stabilityApiKey" type="password" placeholder="Stability API Key" @update:model-value="updateStabilityApiKey(String($event))" /></SettingFormField>
      <SettingFormField title="API 地址" description="默认使用 Stability 官方 API，可填写兼容反向代理。"><Input v-model="stabilitySettings.baseUrl" placeholder="https://api.stability.ai" /></SettingFormField>
      <SettingFormField title="模型" description="使用 Stability v2beta Stable Image 生成端点。">
        <Select v-model="stabilitySettings.model"><SelectTrigger class="w-full sm:w-96"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="model in STABILITY_MODELS" :key="model.id" :value="model.id">{{ model.name }}</SelectItem></SelectGroup></SelectContent></Select>
      </SettingFormField>
      <SettingFormField title="默认服务" description="将当前 Stability 模型设为默认图片模型。"><Button variant="outline" @click="setImageModel(`${STABILITY_PROVIDER_ID}/${stabilitySettings.model}`)">设为默认</Button></SettingFormField>
      <SettingFormField title="输出参数" description="Stability 使用固定宽高比目录，响应以 PNG、JPEG 或 WebP 返回。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Select v-model="stabilitySettings.aspectRatio"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem v-for="ratio in ['1:1','16:9','21:9','2:3','3:2','4:5','5:4','9:16','9:21']" :key="ratio" :value="ratio">{{ ratio }}</SelectItem></SelectGroup></SelectContent></Select>
          <Select v-model="stabilitySettings.outputFormat"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="png">PNG</SelectItem><SelectItem value="jpeg">JPEG</SelectItem><SelectItem value="webp">WebP</SelectItem></SelectGroup></SelectContent></Select>
          <Input v-model="stabilitySettings.stylePreset" class="sm:col-span-2" placeholder="style_preset（可选）" />
        </div>
      </SettingFormField>
      <SettingFormField title="负向提示词" description="最大 10,000 字符，与正向提示词一同提交。"><Textarea v-model="stabilitySettings.negativePrompt" class="min-h-20 resize-y" /></SettingFormField>
      <SettingFormField title="图片生成测试" description="实际调用 Stability Stable Image API。">
        <Button :disabled="testing || !prompt.trim()" @click="runTest">{{ testing ? "生成中…" : "生成图片" }}</Button>
        <template #bottom><div class="grid gap-3"><Textarea v-model="prompt" class="min-h-24 resize-y" /><img v-if="resultUrl" :src="resultUrl" alt="Stability 图片生成测试结果" class="max-h-[32rem] w-full rounded-lg border object-contain" /></div></template>
      </SettingFormField>
    </SettingForm>

    <SettingForm v-else-if="isNovelAI">
      <SettingFormField title="API Key" description="保存在 Secret 数据表中，请求时仅通过代理占位符注入。">
        <Input
          :model-value="novelAIApiKey"
          type="password"
          :placeholder="novelAIApiKey === apiKeyMask ? '已填写，输入新值可替换' : '填写 NovelAI API Key'"
          @update:model-value="updateNovelAIApiKey(String($event))"
        />
      </SettingFormField>

      <SettingFormField title="API 地址" description="默认使用 NovelAI 官方图片服务，也可指向兼容反向代理。">
        <Input v-model="novelAISettings.baseUrl" placeholder="https://image.novelai.net" />
      </SettingFormField>

      <SettingFormField title="默认服务" description="未显式传入 model 时，ImageGeneration 可重定向到当前 NovelAI 模型。">
        <Button
          variant="outline"
          @click="setImageModel(`${NOVELAI_PROVIDER_ID}/${novelAISettings.model}`)"
        >
          设为默认
        </Button>
      </SettingFormField>

      <SettingFormField title="模型" description="使用迁移项目中已验证的 NovelAI 图片模型固定目录。">
        <Select v-model="novelAISettings.model">
          <SelectTrigger class="w-full sm:w-96"><SelectValue placeholder="选择模型" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem v-for="model in NOVELAI_MODELS" :key="model.id" :value="model.id">{{ model.name }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </SettingFormField>

      <SettingFormField title="画布" description="NovelAI 尺寸以 64 像素为步长；默认沿用迁移项目的 832×1216。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Input v-model.number="novelAISettings.width" type="number" min="64" max="2048" step="64" aria-label="宽度" />
          <Input v-model.number="novelAISettings.height" type="number" min="64" max="2048" step="64" aria-label="高度" />
        </div>
      </SettingFormField>

      <SettingFormField title="采样参数" description="参数直接进入 NovelAI 专用请求，不污染 AI SDK 模型设置。">
        <div class="grid w-full gap-2 sm:grid-cols-2">
          <Select v-model="novelAISettings.sampler">
            <SelectTrigger><SelectValue placeholder="采样器" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="sampler in NOVELAI_SAMPLERS" :key="sampler.id" :value="sampler.id">{{ sampler.name }}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input v-model.number="novelAISettings.steps" type="number" min="1" max="50" step="1" placeholder="Steps" />
          <Input v-model.number="novelAISettings.guidance" type="number" min="0" max="10" step="0.1" placeholder="Guidance" />
          <Input
            :model-value="novelAISettings.seed ?? ''"
            type="number"
            min="0"
            max="4294967295"
            step="1"
            placeholder="随机 Seed"
            @update:model-value="updateNovelAISeed($event)"
          />
        </div>
      </SettingFormField>

      <SettingFormField title="质量标签" description="按模型追加 NovelAI 推荐质量标签。">
        <Switch v-model="novelAISettings.addQualityTags" />
      </SettingFormField>

      <SettingFormField title="负向提示词" description="作为 negative_prompt 随每次请求发送。">
        <Textarea v-model="novelAISettings.negativePrompt" class="min-h-20 resize-y" placeholder="不希望出现的内容" />
      </SettingFormField>

      <SettingFormField title="图片生成测试" description="通过 NovelAI 专用 REST adapter 实际生成一张图片。">
        <Button :disabled="testing || !prompt.trim()" @click="runTest">{{ testing ? "生成中…" : "生成图片" }}</Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="prompt" class="min-h-24 resize-y" placeholder="输入图片提示词" />
            <img v-if="resultUrl" :src="resultUrl" alt="图片生成测试结果" class="max-h-[32rem] w-full rounded-lg border object-contain" />
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
      <SettingFormField title="默认模型" description="未显式传入 model 时，ImageGeneration 服务重定向到这里。">
        <Button variant="outline" :disabled="!service.selectedModelRef.value" @click="setImageModel(service.selectedModelRef.value)">
          设为默认
        </Button>
      </SettingFormField>
      <SettingFormField title="图片生成测试" description="通过当前模型实际生成一张图片。">
        <Button :disabled="testing || !prompt.trim()" @click="runTest">{{ testing ? "生成中…" : "生成图片" }}</Button>
        <template #bottom>
          <div class="grid gap-3">
            <Textarea v-model="prompt" class="min-h-24 resize-y" placeholder="输入图片提示词" />
            <img v-if="resultUrl" :src="resultUrl" alt="图片生成测试结果" class="max-h-[32rem] w-full rounded-lg border object-contain" />
          </div>
        </template>
      </SettingFormField>
    </ModelCapabilityProviderForm>
  </ServiceProviderSettingsLayout>
</template>
