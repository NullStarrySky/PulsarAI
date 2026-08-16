import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "modelConnection",
  title: "模型连接",
  description: "通过已经配置的模型连接执行简洁的文本生成。API 不暴露提供商密钥。",
  documentation: {
    overview: "使用现有 ModelConnection 与默认模型配置执行一次无工具文本生成，适合摘要、改写和分类等短任务。",
    notes: [
      "省略 model 时使用默认聊天模型，显式模型值使用 provider/model/thinkingLevel 引用格式，末段可省略。",
      "此入口不创建 Agent，也不启动插件流程或工具循环。",
    ],
    types: [
      {
        name: "GenerateTextInput",
        description: "一次简单文本生成请求。",
        definition: `interface GenerateTextInput {
  prompt: string;
  model?: string;
  system?: string;
}`,
      },
      {
        name: "GenerateTextResult",
        description: "公开给调用方的最小生成结果。",
        definition: `interface GenerateTextResult {
  text: string;
}`,
      },
    ],
  },
  api: [{
    name: "generateText",
    signature: "generateText(input: { prompt: string; model?: string; system?: string }): Promise<{ text: string }>",
    description: "使用指定模型或默认聊天模型生成文本。",
    example: "await modelConnection.generateText({ prompt: '总结这段内容' })",
  }],
};
