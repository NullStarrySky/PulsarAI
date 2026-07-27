import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { getDefaultChatModel } from "@/features/defaultConfigs/application/default-config-service";
import { generateText } from "./application/model-ai";

export const capabilities: CapabilityDefinition = {
  id: "modelConnection",
  title: "模型连接",
  description: "通过已经配置的模型连接执行简洁的文本生成。API 不暴露提供商密钥。",
  subCaps: {
    all: "全部模型连接权限",
    generateText: "生成文本",
  },
  api: {
    generateText: [{
      name: "generateText",
      signature: "generateText(input: { prompt: string; model?: string; system?: string }): Promise<{ text: string }>",
      description: "使用指定模型或默认聊天模型生成文本。",
      example: "await modelConnection.generateText({ prompt: '总结这段内容' })",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("generateText") ? {
    generateText: async (input: { prompt: string; model?: string; system?: string }) => {
      const result = await generateText({
        model: input.model || await getDefaultChatModel(),
        prompt: input.prompt,
        system: input.system,
      });
      return { text: result.text };
    },
  } : {}),
}));
