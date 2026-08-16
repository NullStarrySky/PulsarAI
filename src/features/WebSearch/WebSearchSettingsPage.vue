<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import ServiceProviderSettingsLayout from "@/features/ModelConnection/components/ServiceProviderSettingsLayout.vue";
import type { ServiceProviderView } from "@/features/ModelConnection/service-provider";
import { webSearch, type WebSearchResult } from "./web-search";
import {
  hasExaApiKey,
  loadWebSearchSettings,
  saveExaApiKey,
  saveWebSearchSettings,
} from "./web-search-settings";
import { createDefaultWebSearchSettings, type WebSearchProviderId, type WebSearchSettings } from "./web-search-types";

const secretMask = "••••••••";
const settings = ref<WebSearchSettings>(createDefaultWebSearchSettings());
const exaApiKey = ref("");
const exaHasApiKey = ref(false);
const initialized = ref(false);
const checking = ref(false);
const testQuery = ref("PulsarAI 网络搜索连接测试");
const results = ref<WebSearchResult[]>([]);
const testError = ref("");

const providers = computed<ServiceProviderView[]>(() => [
  {
    id: "playwright",
    name: "Playwright 浏览器",
    description: "本机无头 Chromium 搜索 DuckDuckGo；不需要 API Key，仅支持桌面端。",
    enabled: settings.value.playwrightEnabled,
    canEnable: true,
    source: "feature",
  },
  {
    id: "exa",
    name: "Exa",
    description: "Exa Search API / ExaJS 兼容提供商，返回结构化网页结果并需要 API Key。",
    enabled: settings.value.exaEnabled,
    canEnable: exaHasApiKey.value,
    source: "feature",
  },
]);

const activeProviderId = computed<WebSearchProviderId>(() => settings.value.activeProviderId);
const isExa = computed(() => activeProviderId.value === "exa");

const persist = useDebounceFn(() => saveWebSearchSettings(settings.value), 400);
const persistExaKey = useDebounceFn(async (value: string) => {
  if (value === secretMask) return;
  await saveExaApiKey(value);
  exaHasApiKey.value = Boolean(value.trim());
  if (!exaHasApiKey.value && settings.value.exaEnabled) settings.value.exaEnabled = false;
}, 600);

onMounted(async () => {
  [settings.value, exaHasApiKey.value] = await Promise.all([
    loadWebSearchSettings(),
    hasExaApiKey(),
  ]);
  exaApiKey.value = exaHasApiKey.value ? secretMask : "";
  initialized.value = true;
});

watch(settings, () => {
  if (initialized.value) void persist();
}, { deep: true });

function selectProvider(providerId: string) {
  if (providerId === "playwright" || providerId === "exa") {
    settings.value.activeProviderId = providerId;
  }
}

function toggleProvider(providerId: string, enabled: boolean) {
  if (providerId === "exa" && enabled && !exaHasApiKey.value) {
    push.warning("请先填写 Exa API Key。 ");
    return;
  }
  if (providerId === "playwright") settings.value.playwrightEnabled = enabled;
  if (providerId === "exa") settings.value.exaEnabled = enabled;
}

function updateExaKey(value: string) {
  exaApiKey.value = value;
  void persistExaKey(value);
}

async function testSearch() {
  const provider = activeProviderId.value;
  if (provider === "exa" && !exaHasApiKey.value) {
    push.warning("请先填写 Exa API Key。 ");
    return;
  }
  if (provider === "exa" && !settings.value.exaEnabled) {
    push.warning("请先启用 Exa。 ");
    return;
  }
  if (provider === "playwright" && !settings.value.playwrightEnabled) {
    push.warning("请先启用 Playwright 浏览器。 ");
    return;
  }
  checking.value = true;
  testError.value = "";
  results.value = [];
  try {
    results.value = await webSearch(testQuery.value.trim() || "PulsarAI", settings.value.resultLimit, provider);
    push.success(`搜索可用，返回 ${results.value.length} 条结果。`);
  } catch (error) {
    testError.value = error instanceof Error ? error.message : "搜索连接检查失败";
    push.error("搜索连接检查失败");
  } finally {
    checking.value = false;
  }
}
</script>

<template>
  <ServiceProviderSettingsLayout
    :providers="providers"
    :active-provider-id="activeProviderId"
    search=""
    @update:search="() => undefined"
    @select-provider="selectProvider"
    @toggle-provider="toggleProvider"
  >
    <SettingForm>
      <template v-if="isExa">
        <SettingFormField title="Exa API Key" description="保存在 Secret 数据表中；请求只在原生网络层注入 x-api-key，前端不会读取明文。">
          <Input
            :model-value="exaApiKey"
            type="password"
            placeholder="Exa API Key"
            @update:model-value="updateExaKey(String($event ?? ''))"
          />
        </SettingFormField>
      </template>
      <template v-else>
        <SettingFormField title="Playwright Chromium" description="使用内置 Playwright 原生运行时在隔离无头 Chromium 中检索公开搜索结果。无需浏览器驱动或 Selenium。">
          <p class="text-sm text-muted-foreground">仅提供有边界的搜索与结果摘录；不向模型暴露任意 DOM 执行或浏览器控制能力。</p>
        </SettingFormField>
      </template>

      <SettingFormField title="默认结果数" description="每次搜索返回 1 到 10 条候选结果。">
        <div class="flex w-full items-center gap-4">
          <Slider
            :model-value="[settings.resultLimit]"
            :min="1"
            :max="10"
            :step="1"
            class="flex-1"
            @update:model-value="settings.resultLimit = $event?.[0] ?? settings.resultLimit"
          />
          <span class="w-8 text-right text-sm tabular-nums">{{ settings.resultLimit }}</span>
        </div>
      </SettingFormField>

      <SettingFormField title="连接测试" description="使用当前选中的提供商执行一次真实搜索。">
        <div class="grid w-full gap-3">
          <div class="flex gap-2">
            <Input v-model="testQuery" class="min-w-0 flex-1" placeholder="测试关键词" @keydown.enter.prevent="testSearch" />
            <Button :disabled="checking" @click="testSearch">{{ checking ? "搜索中…" : "测试搜索" }}</Button>
          </div>
          <p v-if="testError" class="text-sm text-destructive">{{ testError }}</p>
          <ul v-if="results.length" class="grid gap-2 text-sm">
            <li v-for="result in results" :key="result.url" class="rounded-lg border bg-muted/20 p-3">
              <a :href="result.url" target="_blank" rel="noreferrer" class="font-medium hover:underline">{{ result.title }}</a>
              <p v-if="result.snippet" class="mt-1 line-clamp-2 text-muted-foreground">{{ result.snippet }}</p>
            </li>
          </ul>
        </div>
      </SettingFormField>
    </SettingForm>
  </ServiceProviderSettingsLayout>
</template>
