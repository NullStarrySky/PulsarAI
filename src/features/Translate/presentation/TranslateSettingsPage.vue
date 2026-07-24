<script setup lang="ts">
import { ArrowLeftRight, Languages } from "lucide-vue-next";
import { onMounted } from "vue";
import { Button } from "@/components/ui/button";
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
import ModelSelect from "@/features/ModelConnection/presentation/ModelSelect.vue";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import { translateLanguages } from "../domain/translate";
import { useTranslateStore } from "../application/translate-store";
import PopableTextarea from "./PopableTextarea.vue";

const translate = useTranslateStore();

onMounted(() => {
  void translate.initialize();
});
</script>

<template>
  <SettingPage title="翻译" description="提供非 LLM 和 LLM 翻译服务，并向外暴露 Pinia 服务。">
    <SettingGroup title="翻译设置">
      <SettingItem title="源语言" description="自动检测适合多数输入。">
        <Select v-model="translate.state.sourceLanguage">
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in translateLanguages" :key="language.id" :value="language.id">
              {{ language.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="目标语言" description="翻译输出语言。">
        <Select v-model="translate.state.targetLanguage">
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in translateLanguages.filter((item) => item.id !== 'auto')" :key="language.id" :value="language.id">
              {{ language.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="非 LLM 提供商" description="Google 可直接测试，Microsoft 需要 Azure 订阅配置。">
        <div class="flex w-full gap-2 sm:w-80">
          <Select v-model="translate.state.provider">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="microsoft">Microsoft</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" @click="translate.testProvider()">测试</Button>
        </div>
      </SettingItem>
      <SettingItem title="Azure 密钥" description="Microsoft Translator 的 Ocp-Apim-Subscription-Key。">
        <Input
          v-model="translate.state.azureKey"
          class="w-full sm:w-80"
          type="password"
          placeholder="Azure Translator Key"
        />
      </SettingItem>
      <SettingItem title="Azure 区域" description="区域或多服务资源需要填写，例如 eastasia、eastus。">
        <Input
          v-model="translate.state.azureRegion"
          class="w-full sm:w-80"
          placeholder="region"
        />
      </SettingItem>
      <SettingItem title="Azure 地址" description="默认使用 Microsoft Translator 全局地址。">
        <Input
          v-model="translate.state.azureEndpoint"
          class="w-full sm:w-80"
          placeholder="https://api.cognitive.microsofttranslator.com"
        />
      </SettingItem>
      <SettingItem title="使用 LLM 进行翻译" description="开启后使用下方模型和提示词。">
        <Switch v-model="translate.state.useLlm" />
      </SettingItem>
      <SettingItem title="LLM 提供商" description="选择翻译使用的模型。">
        <ModelSelect
          :model-value="translate.state.llmModel"
          button-class="w-full justify-between sm:w-80"
          @update:model-value="translate.state.llmModel = $event"
        />
      </SettingItem>
      <SettingItem title="翻译提示词" description="右上角按钮可弹窗编辑。">
        <PopableTextarea v-model="translate.state.prompt" />
      </SettingItem>
    </SettingGroup>

    <section class="rounded-md border bg-card">
      <header class="flex items-center gap-2 border-b px-4 py-3">
        <Languages class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">翻译测试</h2>
        <span class="ml-auto text-xs text-muted-foreground">{{ translate.status }}</span>
      </header>
      <div class="grid min-h-[320px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] divide-x">
        <Textarea
          v-model="translate.sourceText"
          placeholder="输入原文..."
          class="min-h-[320px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0"
        />
        <div class="flex w-16 flex-col items-center justify-center gap-2 bg-muted/20 px-2">
          <Button size="icon" :disabled="translate.translating" title="翻译" @click="translate.translateForPanel">
            <Languages class="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="交换原文译文" @click="translate.swapText">
            <ArrowLeftRight class="size-4" />
          </Button>
        </div>
        <Textarea
          v-model="translate.targetText"
          placeholder="译文..."
          :class="[
            'min-h-[320px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0',
            translate.errorText && 'border-destructive text-destructive focus-visible:ring-destructive',
          ]"
        />
      </div>
      <p v-if="translate.errorText" class="border-t px-4 py-2 text-sm text-destructive">
        {{ translate.errorText }}
      </p>
    </section>
  </SettingPage>
</template>
