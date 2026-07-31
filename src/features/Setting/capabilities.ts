import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { getSettingGroups, getSettingPages } from "./application/setting-registry";

export const capabilities: CapabilityDefinition = {
  id: "setting",
  title: "设置目录",
  description: "查询 Pulsar 已注册的设置分组与页面。",
  documentation: {
    overview: "读取设置导航的注册信息，适合发现可打开页面或生成帮助说明。它不会返回任何设置值、模型密钥或其他 Secret。",
    notes: [
      "groups 决定设置导航分区，pages 保存标题、说明、图标和所属分组等元数据。",
      "需要读取具体配置时应使用该配置所属 Feature 的公开 API。",
    ],
    types: [
      {
        name: "SettingGroupMeta",
        description: "设置导航中的一个分组。",
        definition: `interface SettingGroupMeta {
  id: string;
  title: string;
}`,
      },
      {
        name: "SettingPageMeta",
        description: "设置页面的导航元数据。icon 是已注册 Vue 组件。",
        definition: `interface SettingPageMeta {
  id: string;
  icon: Component;
  title: string;
  group: string;
}`,
      },
      {
        name: "SettingDirectory",
        description: "设置注册表的公开只读形状。",
        definition: `interface SettingDirectory {
  groups: SettingGroupMeta[];
  pages: SettingPageMeta[];
}`,
      },
    ],
  },
  subCaps: {
    all: "全部设置目录权限",
    read: "读取设置目录",
  },
  api: {
    read: [{
      name: "list",
      signature: "list(): SettingDirectory",
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
