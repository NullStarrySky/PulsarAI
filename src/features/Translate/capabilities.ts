import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useTranslateStore } from "./application/translate-store";

export const capabilities: CapabilityDefinition = {
  id: "translate",
  title: "翻译",
  description: "使用当前翻译设置处理文本。",
  subCaps: {
    all: "全部翻译权限",
    translate: "翻译文本",
    readConfig: "读取翻译语言配置",
  },
  api: {
    translate: [{
      name: "text",
      signature: "text(value: string): Promise<string>",
      description: "使用当前提供商与语言设置翻译文本。",
      example: "await translate.text('Hello')",
    }],
    readConfig: [{
      name: "getConfig",
      signature: "getConfig(): { sourceLanguage: string; targetLanguage: string; provider: string }",
      description: "读取不含密钥的当前翻译配置。",
      example: "translate.getConfig()",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("translate") ? {
    text: (value: string) => useTranslateStore().translateText(value),
  } : {}),
  ...(granted.has("readConfig") ? {
    getConfig: () => {
      const state = useTranslateStore().state;
      return {
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        provider: state.provider,
      };
    },
  } : {}),
}));
