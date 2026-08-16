import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "setting",
  title: "设置目录",
  description: "查询 Pulsar 已注册的设置页面与一级功能 Tab。",
  documentation: {
    overview: "读取设置导航的注册信息，适合发现可打开页面或生成帮助说明。它不会返回任何设置值、模型密钥或其他 Secret。",
    notes: [
      "pages 按设置导航顺序返回；tabs 是页面内部可选的一级功能划分。",
      "需要读取具体配置时应使用该配置所属 Feature 的公开 API。",
    ],
    types: [
      {
        name: "SettingTabMeta",
        description: "设置页面内部的一级功能 Tab。",
        definition: `interface SettingTabMeta {
  id: string;
  title: string;
}`,
      },
      {
        name: "SettingPageMeta",
        description: "设置页面的公开导航元数据。",
        definition: `interface SettingPageMeta {
  id: string;
  title: string;
  tabs: SettingTabMeta[];
}`,
      },
      {
        name: "SettingDirectory",
        description: "设置注册表的公开只读形状。",
        definition: `interface SettingDirectory {
  pages: SettingPageMeta[];
}`,
      },
    ],
  },
  api: [{
    name: "list",
    signature: "list(): SettingDirectory",
    description: "按导航顺序列出设置页面与一级功能 Tab，不返回配置值或密钥。",
    example: "setting.list()",
  }],
};
