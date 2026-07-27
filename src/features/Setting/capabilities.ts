import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { getSettingGroups, getSettingPages } from "./application/setting-registry";

export const capabilities: CapabilityDefinition = {
  id: "setting",
  title: "设置目录",
  description: "查询 Pulsar 已注册的设置分组与页面。",
  subCaps: {
    all: "全部设置目录权限",
    read: "读取设置目录",
  },
  api: {
    read: [{
      name: "list",
      signature: "list(): { groups: SettingGroup[]; pages: SettingPage[] }",
      description: "列出设置分组与页面的元数据，不返回配置值或密钥。",
      example: "setting.list()",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: () => ({
      groups: getSettingGroups(),
      pages: getSettingPages().map(({ meta }) => meta),
    }),
  } : {}),
}));
