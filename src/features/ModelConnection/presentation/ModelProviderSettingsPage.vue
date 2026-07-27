<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { push } from "notivue";
import { ChevronDown, Clipboard, Plus, Search } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import { generateText } from "../application/ai";
import { fetchOpenAICompatibleModels } from "../application/openai-compatible-models";
import { modelTypeLabels, useModelConnectionStore } from "../application/model-connection-store";
import type { ModelApiType } from "../domain/model-provider";
import ProviderAvatar from "./ProviderAvatar.vue";

const store = useModelConnectionStore();
const providerDialogOpen = ref(false);
const modelDialogOpen = ref(false);
const apiKeyDraft = ref("");
const connectivityModelId = ref("");
const connectivityPrompt = ref("请用一句话回复：连接正常。");
const connectivityResponse = ref("");
const connectivityFailed = ref(false);
const checkingConnectivity = ref(false);
const fetchingModels = ref(false);
const apiKeyMask = "••••••••";

const providerForm = reactive({
  id: "",
  name: "",
  description: "",
  iconUrl: "",
  baseUrl: "",
  apiKey: "",
});

const modelForm = reactive({
  id: "",
  name: "",
  apiType: "chat" as ModelApiType,
  contextSize: undefined as number | undefined,
  iconUrl: "",
});

const activeProvider = computed(() => store.activeProvider);
const activeProviderHasKey = computed(() => Boolean(store.apiKeyStatus[activeProvider.value.apiKeyName]));
const providerChatModels = computed(() => activeProvider.value.models.filter((model) => model.enabled && model.apiType === "chat"));

onMounted(async () => {
  await store.initialize();
  await store.refreshSecretStatus(activeProvider.value.id);
  syncApiKeyDraft();
  syncConnectivityModel();
});

watch(() => activeProvider.value.id, async (providerId) => {
  await store.refreshSecretStatus(providerId);
  syncApiKeyDraft();
  syncConnectivityModel();
});

function tabLabel(tab: ModelApiType | "all") {
  return tab === "all" ? "全部" : modelTypeLabels[tab];
}

function resetProviderForm() {
  providerForm.id = "";
  providerForm.name = "";
  providerForm.description = "";
  providerForm.iconUrl = "";
  providerForm.baseUrl = "";
  providerForm.apiKey = "";
}

function resetModelForm() {
  modelForm.id = "";
  modelForm.name = "";
  modelForm.apiType = "chat";
  modelForm.contextSize = undefined;
  modelForm.iconUrl = "";
}

function syncApiKeyDraft() {
  apiKeyDraft.value = activeProviderHasKey.value ? apiKeyMask : "";
}

function syncConnectivityModel() {
  if (!providerChatModels.value.some((model) => model.id === connectivityModelId.value)) {
    connectivityModelId.value = providerChatModels.value[0]?.id ?? "";
  }
}

const saveApiKeyDebounced = useDebounceFn(async (value: string) => {
  if (value === apiKeyMask) {
    return;
  }

  if (!value.trim()) {
    await store.clearProviderApiKeyValue(activeProvider.value.id);
    return;
  }

  await store.saveProviderApiKey(activeProvider.value.id, value.trim());
}, 600);

function updateApiKey(value: string) {
  apiKeyDraft.value = value;
  void saveApiKeyDebounced(value);
}

async function addProvider() {
  try {
    await store.addProvider({ ...providerForm });
    resetProviderForm();
    providerDialogOpen.value = false;
    push.success("服务商已添加");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "服务商添加失败");
  }
}

async function addModel() {
  try {
    await store.addModel(activeProvider.value.id, {
      ...modelForm,
      contextSize: modelForm.contextSize ? Number(modelForm.contextSize) : undefined,
      iconUrl: modelForm.iconUrl.trim() || undefined,
    });
    resetModelForm();
    modelDialogOpen.value = false;
    push.success("模型已添加");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "模型添加失败");
  }
}

async function activateProvider(providerId: string) {
  store.activateProvider(providerId);
  await store.refreshSecretStatus(providerId);
}

async function checkConnectivity() {
  if (!connectivityModelId.value) {
    push.warning("请先选择一个对话模型。");
    return;
  }

  checkingConnectivity.value = true;
  connectivityFailed.value = false;
  connectivityResponse.value = "";
  try {
    const result = await generateText({
      model: `${activeProvider.value.id}/${connectivityModelId.value}`,
      prompt: connectivityPrompt.value.trim() || "请用一句话回复：连接正常。",
    });
    connectivityResponse.value = result.text.trim();
    push.success(connectivityResponse.value ? "连接可用。" : "请求完成，但模型没有返回内容。");
  } catch (error) {
    connectivityFailed.value = true;
    connectivityResponse.value = error instanceof Error ? error.message : "连接检查失败";
    push.error("连接检查失败");
  } finally {
    checkingConnectivity.value = false;
  }
}

async function copyText(value: string) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  push.success("已复制");
}

async function fetchModelList() {
  fetchingModels.value = true;
  try {
    const models = await fetchOpenAICompatibleModels(activeProvider.value);
    const added = await store.upsertModels(activeProvider.value.id, models);
    syncConnectivityModel();
    push.success(added > 0 ? `已添加 ${added} 个模型。` : "模型列表已是最新。");
  } catch (error) {
    push.error(error instanceof Error ? error.message : "获取模型列表失败");
  } finally {
    fetchingModels.value = false;
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="grid h-full min-h-0 overflow-hidden lg:grid-cols-[15rem_minmax(0,1fr)] mobile:grid-rows-[10rem_minmax(0,1fr)]">
      <aside class="flex min-h-0 flex-col border-r mobile:border-b mobile:border-r-0">
        <div class="flex items-center gap-2 border-b p-3">
          <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="store.search" class="h-8 pl-8" placeholder="搜索服务商" />
          </div>
          <Button size="icon" variant="ghost" class="size-8" title="新增服务商" @click="providerDialogOpen = true">
            <Plus class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <section>
            <button
              class="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground"
              @click="store.enabledCollapsed = !store.enabledCollapsed"
            >
              已启用
              <ChevronDown :class="cn('size-4 transition-transform', store.enabledCollapsed && '-rotate-90')" />
            </button>
            <div v-if="!store.enabledCollapsed" class="space-y-1">
              <button
                v-for="provider in store.enabledProviders"
                :key="provider.id"
                :class="cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                  provider.id === activeProvider.id && 'bg-accent text-accent-foreground',
                )"
                @click="activateProvider(provider.id)"
              >
                <ProviderAvatar :name="provider.name" :src="provider.iconUrl" />
                <span class="min-w-0 truncate">{{ provider.name }}</span>
              </button>
            </div>
          </section>

          <section class="mt-2">
            <button
              class="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-muted-foreground"
              @click="store.disabledCollapsed = !store.disabledCollapsed"
            >
              未启用
              <ChevronDown :class="cn('size-4 transition-transform', store.disabledCollapsed && '-rotate-90')" />
            </button>
            <div v-if="!store.disabledCollapsed" class="space-y-1">
              <button
                v-for="provider in store.disabledProviders"
                :key="provider.id"
                :class="cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                  provider.id === activeProvider.id && 'bg-accent text-accent-foreground',
                )"
                @click="activateProvider(provider.id)"
              >
                <ProviderAvatar :name="provider.name" :src="provider.iconUrl" />
                <span class="min-w-0 truncate">{{ provider.name }}</span>
              </button>
            </div>
          </section>
        </div>
      </aside>

      <section class="flex min-h-0 flex-col">
        <header class="flex items-center justify-between gap-3 border-b px-6 pb-5 pt-6 mobile:px-4 mobile:py-3">
          <div class="flex min-w-0 items-center gap-3">
            <ProviderAvatar :name="activeProvider.name" :src="activeProvider.iconUrl" />
            <div class="min-w-0">
              <h3 class="truncate text-lg font-semibold">{{ activeProvider.name }}</h3>
              <p class="truncate text-sm text-muted-foreground">{{ activeProvider.description || activeProvider.id }}</p>
            </div>
          </div>
          <Switch
            :model-value="activeProvider.enabled"
            @update:model-value="store.patchProvider(activeProvider.id, { enabled: Boolean($event) })"
          />
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-6 mobile:p-4">
          <div class="grid gap-8 mobile:gap-6">
            <SettingForm>
              <SettingFormField title="API Key" description="用于连接当前服务商。">
                <Input
                  :model-value="apiKeyDraft"
                  type="password"
                  :placeholder="activeProviderHasKey ? '已填写，输入新值可替换' : '填写 API Key'"
                  @update:model-value="updateApiKey(String($event))"
                />
              </SettingFormField>

              <SettingFormField title="API 代理地址" description="服务商的请求地址。">
                <Input
                  :model-value="activeProvider.baseUrl"
                  placeholder="https://api.example.com/v1"
                  @update:model-value="store.patchProvider(activeProvider.id, { baseUrl: String($event) })"
                />
              </SettingFormField>

              <SettingFormField title="连通性检查" description="发送一条短消息，确认当前服务可用。">
                <div class="flex justify-end gap-2 mobile:flex-col">
                  <Select v-model="connectivityModelId">
                    <SelectTrigger class="w-56 mobile:w-full">
                      <SelectValue placeholder="选择对话模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="model in providerChatModels" :key="model.id" :value="model.id">
                        {{ model.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" :disabled="checkingConnectivity || !connectivityModelId" @click="checkConnectivity">
                    检查
                  </Button>
                </div>
                <template #bottom>
                  <div class="grid w-full gap-3 text-left lg:grid-cols-2">
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-muted-foreground">提示词</span>
                        <Button size="icon" variant="ghost" class="size-7" title="复制提示词" @click="copyText(connectivityPrompt)">
                          <Clipboard class="size-3.5" />
                        </Button>
                      </div>
                      <Textarea v-model="connectivityPrompt" class="min-h-20 resize-none text-sm" />
                    </div>
                    <div class="space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-muted-foreground">回复</span>
                        <Button size="icon" variant="ghost" class="size-7" title="复制回复" @click="copyText(connectivityResponse)">
                          <Clipboard class="size-3.5" />
                        </Button>
                      </div>
                      <Textarea
                        :model-value="connectivityResponse"
                        readonly
                        class="min-h-24 resize-none text-sm"
                        :class="connectivityFailed && 'border-destructive text-destructive focus-visible:ring-destructive/30'"
                        placeholder="检查后显示回复或错误信息"
                      />
                    </div>
                  </div>
                </template>
              </SettingFormField>
            </SettingForm>

            <section class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 class="text-base font-semibold">模型列表</h3>
                  <p class="text-sm text-muted-foreground">{{ store.availableModelCount }} 个模型可用</p>
                </div>
                <div class="flex items-center gap-2 mobile:w-full mobile:flex-wrap">
                  <div class="relative w-52 mobile:min-w-full">
                    <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input v-model="store.modelSearch" class="h-8 pl-8" placeholder="搜索模型" />
                  </div>
                  <Button variant="outline" size="sm" :disabled="fetchingModels" @click="fetchModelList">
                    获取列表
                  </Button>
                  <Button size="icon" class="size-8" title="新增模型" @click="modelDialogOpen = true">
                    <Plus class="size-4" />
                  </Button>
                </div>
              </div>

              <div class="flex flex-wrap gap-1 border-b">
                <button
                  v-for="tab in store.visibleModelTabs"
                  :key="tab"
                  :class="cn(
                    'h-9 border-b-2 px-3 text-sm transition-colors',
                    store.activeModelTab === tab
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )"
                  @click="store.activeModelTab = tab"
                >
                  {{ tabLabel(tab) }}
                </button>
              </div>

              <div class="divide-y border-y">
                <div
                  v-for="model in store.activeModels"
                  :key="model.id"
                  class="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <ProviderAvatar :name="model.name" :src="model.iconUrl || activeProvider.iconUrl" />
                    <div class="min-w-0">
                      <div class="flex min-w-0 items-center gap-2">
                        <span class="truncate text-sm font-medium">{{ model.name }}</span>
                        <Badge variant="secondary">{{ tabLabel(model.apiType) }}</Badge>
                      </div>
                      <p class="truncate text-xs text-muted-foreground">{{ model.id }}</p>
                    </div>
                  </div>
                  <div class="flex items-center justify-end gap-3">
                    <span class="text-xs text-muted-foreground">
                      {{ model.contextSize ? `${model.contextSize.toLocaleString()} ctx` : "ctx 未知" }}
                    </span>
                    <Switch
                      :model-value="model.enabled"
                      @update:model-value="store.patchModel(activeProvider.id, model.id, { enabled: Boolean($event) })"
                    />
                  </div>
                </div>
                <div v-if="store.activeModels.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
                  没有匹配的模型
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>

    <Dialog v-model:open="providerDialogOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增服务商</DialogTitle>
          <DialogDescription>添加一个兼容的模型服务商。</DialogDescription>
        </DialogHeader>
        <SettingForm>
          <SettingFormField title="服务商 ID" description="创建后不可修改。" required>
            <Input v-model="providerForm.id" placeholder="例如 openrouter" />
          </SettingFormField>
          <SettingFormField title="API Key 名称">
            <Input :model-value="providerForm.id ? `${providerForm.id.toLowerCase()}_API_KEY` : ''" disabled />
          </SettingFormField>
          <SettingFormField title="服务商名称">
            <Input v-model="providerForm.name" placeholder="显示名称" />
          </SettingFormField>
          <SettingFormField title="简介">
            <Input v-model="providerForm.description" placeholder="简短说明" />
          </SettingFormField>
          <SettingFormField title="图标地址">
            <Input v-model="providerForm.iconUrl" placeholder="可选" />
          </SettingFormField>
          <SettingFormField title="API 代理地址">
            <Input v-model="providerForm.baseUrl" placeholder="https://api.example.com/v1" />
          </SettingFormField>
          <SettingFormField title="API Key">
            <Input v-model="providerForm.apiKey" type="password" placeholder="可选" />
          </SettingFormField>
        </SettingForm>
        <DialogFooter>
          <Button variant="outline" @click="providerDialogOpen = false">取消</Button>
          <Button @click="addProvider">添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="modelDialogOpen">
      <DialogContent class="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>新增模型</DialogTitle>
          <DialogDescription>添加当前服务商下的模型。</DialogDescription>
        </DialogHeader>
        <SettingForm>
          <SettingFormField title="模型 ID" description="创建后不可修改。" required>
            <Input v-model="modelForm.id" placeholder="例如 gpt-4o-mini" />
          </SettingFormField>
          <SettingFormField title="模型名称">
            <Input v-model="modelForm.name" placeholder="显示名称" />
          </SettingFormField>
          <SettingFormField title="模型类型">
            <Select v-model="modelForm.apiType">
              <SelectTrigger class="w-full">
                <SelectValue placeholder="选择模型类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">对话</SelectItem>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="video">视频</SelectItem>
                <SelectItem value="embedding">向量化</SelectItem>
                <SelectItem value="asr">ASR</SelectItem>
                <SelectItem value="tts">TTS</SelectItem>
              </SelectContent>
            </Select>
          </SettingFormField>
          <SettingFormField title="上下文大小">
            <Input v-model.number="modelForm.contextSize" type="number" placeholder="可选" />
          </SettingFormField>
          <SettingFormField title="图标地址">
            <Input v-model="modelForm.iconUrl" placeholder="可选" />
          </SettingFormField>
        </SettingForm>
        <DialogFooter>
          <Button variant="outline" @click="modelDialogOpen = false">取消</Button>
          <Button @click="addModel">添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
