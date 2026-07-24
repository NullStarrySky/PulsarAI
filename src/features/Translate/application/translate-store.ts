import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { generateText } from "@/features/ModelConnection/application/ai";
import { modelProxyFetch } from "@/features/ModelConnection/infrastructure/model-proxy-fetch";
import { useDefaultConfigStore } from "@/features/defaultConfigs/application/default-config-store";
import { createDefaultTranslateState, type TranslateState } from "../domain/translate";

const storageKey = "pulsarai:translate:v1";
const defaultSource = `I wandered lonely as a cloud
That floats on high o'er vales and hills,
When all at once I saw a crowd,
A host, of golden daffodils;`;

export const useTranslateStore = defineStore("translate", () => {
  const state = ref<TranslateState>(readSnapshot());
  const sourceText = ref(defaultSource);
  const targetText = ref("");
  const errorText = ref("");
  const status = ref("");
  const translating = ref(false);

  watch(state, () => persistSnapshot(state.value), { deep: true });

  async function initialize() {
    const defaults = useDefaultConfigStore();
    await defaults.load();
    if (!state.value.llmModel) {
      state.value.llmModel = defaults.fastModel || defaults.defaultChatModel;
    }
  }

  async function testProvider() {
    try {
      await translateText("hello", true);
      status.value = "测试通过";
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : "测试失败";
      status.value = "测试失败";
    }
  }

  async function translateText(text = sourceText.value, testOnly = false) {
    await initialize();
    translating.value = true;
    errorText.value = "";
    status.value = "正在翻译...";
    try {
      const translated = state.value.useLlm
        ? await translateWithLlm(text, state.value)
        : await translateWithProvider(text, state.value);
      if (!testOnly) {
        targetText.value = translated;
      }
      status.value = "翻译完成";
      return translated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "翻译失败";
      errorText.value = message;
      status.value = message;
      throw error;
    } finally {
      translating.value = false;
    }
  }

  async function translateForPanel() {
    try {
      await translateText();
    } catch {
      // The store already exposes the error in errorText/status for the panel.
    }
  }

  function swapText() {
    [sourceText.value, targetText.value] = [targetText.value, sourceText.value];
  }

  return {
    state,
    sourceText,
    targetText,
    errorText,
    status,
    translating,
    initialize,
    testProvider,
    translateText,
    translateForPanel,
    swapText,
  };
});

async function translateWithLlm(text: string, state: TranslateState) {
  const prompt = `${state.prompt
    .split("{{sourceLanguage}}").join(state.sourceLanguage)
    .split("{{targetLanguage}}").join(state.targetLanguage)}

${text}`;
  const result = await generateText({ model: state.llmModel, prompt });
  return result.text;
}

async function translateWithProvider(text: string, state: TranslateState) {
  if (!text.trim()) {
    return "";
  }
  if (state.provider === "microsoft") {
    return translateWithAzure(text, state);
  }

  const params = new URLSearchParams({
    client: "gtx",
    sl: state.sourceLanguage === "auto" ? "auto" : state.sourceLanguage,
    tl: state.targetLanguage,
    dt: "t",
    q: text,
  });
  let response: Response;
  try {
    response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`);
  } catch {
    response = await modelProxyFetch(`https://translate.googleapis.com/translate_a/single?${params}`);
  }
  if (!response.ok) {
    throw new Error(`Google Translate 请求失败 (${response.status})`);
  }
  const data = await response.json() as [Array<[string]>];
  return (data[0] ?? []).map((part) => part[0] ?? "").join("");
}

async function translateWithAzure(text: string, state: TranslateState) {
  if (!state.azureKey.trim()) {
    throw new Error("请先填写 Azure Translator 密钥。");
  }

  const endpoint = state.azureEndpoint.trim().replace(/\/$/, "") || "https://api.cognitive.microsofttranslator.com";
  const params = new URLSearchParams({
    "api-version": "3.0",
    to: state.targetLanguage,
  });
  if (state.sourceLanguage !== "auto") {
    params.set("from", state.sourceLanguage);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": state.azureKey,
  };
  if (state.azureRegion.trim()) {
    headers["Ocp-Apim-Subscription-Region"] = state.azureRegion.trim();
  }

  const response = await modelProxyFetch(`${endpoint}/translate?${params}`, {
    method: "POST",
    headers,
    body: JSON.stringify([{ text }]),
  });
  if (!response.ok) {
    throw new Error(`Azure Translator 请求失败 (${response.status})`);
  }
  const data = await response.json() as Array<{ translations?: Array<{ text?: string }> }>;
  return data[0]?.translations?.[0]?.text ?? "";
}

function readSnapshot() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return createDefaultTranslateState();
  }
  try {
    return { ...createDefaultTranslateState(), ...(JSON.parse(raw) as Partial<TranslateState>) };
  } catch {
    return createDefaultTranslateState();
  }
}

function persistSnapshot(snapshot: TranslateState) {
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}
