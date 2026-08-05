import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import {
  getDefaultConfig,
  setDefaultConfig,
} from "./application/default-config-service";
import { defaultConfigKeys, fallbackDefaultConfigs } from "./domain/default-config";

export const capabilities: CapabilityDefinition = {
  id: "defaultConfigs",
  title: "默认配置",
  description: "读取或修改 Pulsar 的非敏感默认配置。密钥不在此 API 中暴露。",
  documentation: {
    overview: "管理新资源与未显式覆盖设置时采用的应用级默认值。模型引用以 provider/model 字符串保存，权限默认值不通过此 API 修改。",
    notes: [
      "可读取和写入默认聊天、快速、向量化与图片生成模型。",
      "模型连接密钥保存在独立 Secret 存储中，永远不会由此 Feature 返回。",
    ],
    types: [{
      name: "DefaultConfigKey",
      description: "允许通过公开 API 访问的默认配置键。",
      definition: `type DefaultConfigKey =
  | "defaultChatModel"
  | "fastModel"
  | "embeddingModel"
  | "imageModel";`,
    }],
  },
  subCaps: {
    all: "全部默认配置权限",
    read: "读取默认配置",
    write: "修改默认配置",
  },
  api: {
    read: [{
      name: "get",
      signature: "get(key: DefaultConfigKey): Promise<string>",
      description: "读取一个默认配置。",
      returns: "配置值。",
      example: "await defaultConfigs.get('defaultChatModel')",
    }],
    write: [{
      name: "set",
      signature: "set(key: DefaultConfigKey, value: string): Promise<void>",
      description: "写入一个默认配置。",
      example: "await defaultConfigs.set('fastModel', 'openai/gpt-4o-mini')",
    }],
  },
};

type DefaultConfigKey = keyof typeof defaultConfigKeys;

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    get: <K extends DefaultConfigKey>(key: K) =>
      getDefaultConfig(defaultConfigKeys[key], fallbackDefaultConfigs[key]),
  } : {}),
  ...(granted.has("write") ? {
    set: (key: DefaultConfigKey, value: string) =>
      setDefaultConfig(defaultConfigKeys[key], value),
  } : {}),
}));
