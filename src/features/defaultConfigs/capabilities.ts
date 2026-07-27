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

type DefaultConfigKey = Exclude<keyof typeof defaultConfigKeys, "defaultCapabilities">;

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
