<script setup lang="ts">
import { computed } from "vue";
import { push } from "notivue";
import { KeyRound, PlugZap } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import SettingSwitch from "@/features/Setting/presentation/SettingSwitch.vue";
import SettingTextInput from "@/features/Setting/presentation/SettingTextInput.vue";
import { cn } from "@/lib/utils";
import { useModelConnectionStore } from "../application/model-connection-store";
import type { BuiltinModelProviderId } from "../domain/model-provider";

const modelConnection = useModelConnectionStore();
const { activeConnection, activeProvider, activeProviderId, providers } = storeToRefs(modelConnection);

const canTest = computed(() => Boolean(activeConnection.value.apiKey && activeConnection.value.model));

function patchActive(key: "enabled" | "apiKey" | "baseUrl" | "model", value: boolean | string) {
  modelConnection.patchConnection(activeProviderId.value, { [key]: value });
}

function testProvider() {
  if (!canTest.value) {
    push.warning({
      title: "配置未完成",
      message: "请先填写 API Key 和模型名称。",
    });
    return;
  }

  push.info({
    title: "模型配置已就绪",
    message: `${activeProvider.value?.title ?? "Provider"} 将在后续对话流中接入 AI SDK。`,
  });
}
</script>

<template>
  <SettingPage title="模型提供商" description="管理外部模型 provider 的基础连接信息。">
    <div class="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <section class="flex flex-col gap-2">
        <Button
          v-for="provider in providers"
          :key="provider.id"
          :class="cn('h-auto justify-start px-3 py-3', activeProviderId === provider.id && 'bg-accent text-accent-foreground')"
          variant="ghost"
          @click="modelConnection.activateProvider(provider.id as BuiltinModelProviderId)"
        >
          <PlugZap data-icon="inline-start" />
          <span class="flex min-w-0 flex-col items-start">
            <span class="truncate">{{ provider.title }}</span>
            <span class="text-xs text-muted-foreground">{{ provider.defaultModel }}</span>
          </span>
        </Button>
      </section>

      <div class="min-w-0">
        <SettingGroup :title="activeProvider?.title" :description="activeProvider?.description">
          <SettingItem title="启用 provider" description="启用后会作为后续对话流可选模型来源。">
            <SettingSwitch
              :model-value="activeConnection.enabled"
              @update:model-value="patchActive('enabled', $event)"
            />
          </SettingItem>

          <SettingItem title="API Key" description="Phase 1 仅保存在当前 Pinia 会话状态中。">
            <SettingTextInput
              :model-value="activeConnection.apiKey"
              placeholder="sk-..."
              type="password"
              @update:model-value="patchActive('apiKey', $event)"
            />
          </SettingItem>

          <SettingItem title="Base URL" description="兼容 OpenAI 风格接口的服务地址。">
            <SettingTextInput
              :model-value="activeConnection.baseUrl"
              placeholder="https://api.example.com/v1"
              @update:model-value="patchActive('baseUrl', $event)"
            />
          </SettingItem>

          <SettingItem title="默认模型" description="作为后续会话的初始模型。">
            <SettingTextInput
              :model-value="activeConnection.model"
              placeholder="model-name"
              @update:model-value="patchActive('model', $event)"
            />
          </SettingItem>
        </SettingGroup>

        <div class="mt-4 flex items-center justify-between rounded-lg border bg-card px-4 py-3">
          <div class="flex min-w-0 items-center gap-2">
            <KeyRound />
            <span class="truncate text-sm text-muted-foreground">当前连接不会在 Phase 1 发起真实网络请求。</span>
          </div>
          <div class="flex items-center gap-2">
            <Badge variant="secondary">{{ activeConnection.enabled ? "Enabled" : "Disabled" }}</Badge>
            <Button variant="outline" @click="testProvider">测试配置</Button>
          </div>
        </div>
      </div>
    </div>
  </SettingPage>
</template>
