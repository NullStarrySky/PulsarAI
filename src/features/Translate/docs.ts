import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "translate",
  title: "翻译",
  description: "使用当前翻译设置处理文本。",
  documentation: {
    overview: "复用用户当前选择的翻译提供商、源语言和目标语言完成文本翻译。读取配置时只返回非敏感字段。",
    notes: [
      "text 不接受临时语言覆盖，调用前应先通过 getConfig 确认当前方向。",
      "提供商密钥来自 Translate 自己的设置与 Secret 管理，不会出现在返回值中。",
    ],
    types: [{
      name: "TranslateConfig",
      description: "公开的当前翻译配置。",
      definition: `interface TranslateConfig {
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
}`,
    }],
  },
  api: [
    {
      name: "text",
      signature: "text(value: string): Promise<string>",
      description: "使用当前提供商与语言设置翻译文本。",
      example: "await translate.text('Hello')",
    },
    {
      name: "getConfig",
      signature: "getConfig(): { sourceLanguage: string; targetLanguage: string; provider: string }",
      description: "读取不含密钥的当前翻译配置。",
      example: "translate.getConfig()",
    },
  ],
};
