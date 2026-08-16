import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "defaultConfigs",
  title: "默认配置",
  description: "读取或修改 Pulsar 的非敏感默认配置。密钥不在此 API 中暴露。",
  documentation: {
    overview: "管理新资源与未显式覆盖设置时采用的应用级默认值。聊天模型引用以 provider/model/thinkingLevel 字符串保存，末段可省略。",
    notes: [
      "可读取和写入默认聊天、快速、向量化、媒体与提示词优化配置。",
      "模型连接密钥保存在独立 Secret 存储中，永远不会由此 Feature 返回。",
    ],
    types: [{
      name: "DefaultConfigKey",
      description: "允许通过公开 API 访问的默认配置键。",
      definition: `type DefaultConfigKey =
  | "defaultChatModel"
  | "fastModel"
  | "embeddingModel"
  | "imageModel"
  | "speechModel"
  | "transcriptionModel"
  | "promptOptimizationModel"
  | "promptOptimizationPrompt";`,
    }],
  },
  api: [
    {
      name: "get",
      signature: "get(key: DefaultConfigKey): Promise<string>",
      description: "读取一个默认配置。",
      returns: "配置值。",
      example: "await defaultConfigs.get('defaultChatModel')",
    },
    {
      name: "set",
      signature: "set(key: DefaultConfigKey, value: string): Promise<void>",
      description: "写入一个默认配置。",
      example: "await defaultConfigs.set('fastModel', 'openai/gpt-4o-mini')",
    },
  ],
};
