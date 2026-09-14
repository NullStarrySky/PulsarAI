<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import DefaultPicker from "@/features/Request/components/DefaultPicker.vue";
import { useRequestDefaults } from "@/features/Request/defaults";
import { ArrowLeftRight, Languages } from "@/lib/phosphor-icons";
import { translateLanguages } from "../../defaults";
import { useEnvironmentStore } from "../../store";

const defaultSource = `I wandered lonely as a cloud
That floats on high o'er vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;`;

const environment = useEnvironmentStore();
const state = environment.translateSettings;

const sourceText = ref(defaultSource);
const targetText = ref("");
const errorText = ref("");
const status = ref("");
const translating = ref(false);

onMounted(() => {
	if (!state.llmModel) {
		state.llmModel = useRequestDefaults().defaults.fastModel;
	}
});

async function testProvider() {
	try {
		await environment.translateText("hello");
		status.value = "测试通过";
	} catch (error) {
		errorText.value = error instanceof Error ? error.message : "测试失败";
		status.value = "测试失败";
	}
}

async function translateForPanel() {
	translating.value = true;
	errorText.value = "";
	status.value = "正在翻译...";
	try {
		const translated = await environment.translateText(sourceText.value);
		targetText.value = translated;
		status.value = "翻译完成";
	} catch (error) {
		const message = error instanceof Error ? error.message : "翻译失败";
		errorText.value = message;
		status.value = message;
	} finally {
		translating.value = false;
	}
}

function swapText() {
	[sourceText.value, targetText.value] = [targetText.value, sourceText.value];
}
</script>

<template>
  <SettingPage title="翻译" description="提供非 LLM 和 LLM 翻译服务，并向外暴露 Pinia 服务。">
    <SettingGroup title="翻译设置">
      <SettingItem title="源语言" description="自动检测适合多数输入。">
        <Select v-model="state.sourceLanguage">
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in translateLanguages" :key="language.id" :value="language.id">
              {{ language.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="目标语言" description="翻译输出语言。">
        <Select v-model="state.targetLanguage">
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
          <Select v-model="state.provider">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="google">Google</SelectItem>
              <SelectItem value="microsoft">Microsoft</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="secondary" @click="testProvider">测试</Button>
        </div>
      </SettingItem>
      <SettingItem title="Azure 密钥" description="Microsoft Translator 的 Ocp-Apim-Subscription-Key。">
        <Input
          v-model="state.azureKey"
          class="w-full sm:w-80"
          type="password"
          placeholder="Azure Translator Key"
        />
      </SettingItem>
      <SettingItem title="Azure 区域" description="区域或多服务资源需要填写，例如 eastasia、eastus。">
        <Input
          v-model="state.azureRegion"
          class="w-full sm:w-80"
          placeholder="region"
        />
      </SettingItem>
      <SettingItem title="Azure 地址" description="默认使用 Microsoft Translator 全局地址。">
        <Input
          v-model="state.azureEndpoint"
          class="w-full sm:w-80"
          placeholder="https://api.cognitive.microsofttranslator.com"
        />
      </SettingItem>
      <SettingItem title="使用 LLM 进行翻译" description="开启后使用下方模型和提示词。">
        <Switch v-model="state.useLlm" />
      </SettingItem>
      <SettingItem title="LLM 提供商" description="选择翻译使用的模型。">
        <DefaultPicker v-model="state.llmModel" kind="text" allow-empty />
      </SettingItem>
      <SettingItem title="翻译提示词" description="右上角按钮可弹窗编辑。">
        <Textarea v-model="state.prompt" class="min-h-24 w-full sm:w-80" />
      </SettingItem>
    </SettingGroup>

    <section class="rounded-md border bg-card">
      <header class="flex items-center gap-2 border-b px-4 py-3">
        <Languages class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">翻译测试</h2>
        <span class="ml-auto text-xs text-muted-foreground">{{ status }}</span>
      </header>
      <div class="grid min-h-[320px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] divide-x mobile:grid-cols-1 mobile:grid-rows-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] mobile:divide-x-0 mobile:divide-y">
        <Textarea
          v-model="sourceText"
          placeholder="输入原文..."
          class="min-h-[320px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0 mobile:min-h-48"
        />
        <div class="flex w-16 flex-col items-center justify-center gap-2 bg-muted/20 px-2 mobile:h-14 mobile:w-full mobile:flex-row mobile:px-3">
          <Button size="icon" :disabled="translating" title="翻译" @click="translateForPanel">
            <Languages class="size-4" />
          </Button>
          <Button size="icon" variant="ghost" title="交换原文译文" @click="swapText">
            <ArrowLeftRight class="size-4" />
          </Button>
        </div>
        <Textarea
          v-model="targetText"
          placeholder="译文..."
          :class="[
            'min-h-[320px] resize-none rounded-none border-0 bg-transparent focus-visible:ring-0 mobile:min-h-48',
            errorText && 'border-destructive text-destructive focus-visible:ring-destructive',
          ]"
        />
      </div>
      <p v-if="errorText" class="border-t px-4 py-2 text-sm text-destructive">
        {{ errorText }}
      </p>
    </section>
  </SettingPage>
</template>
