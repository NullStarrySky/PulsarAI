import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "misc",
  title: "运行环境",
  description: "读取当前运行平台，或发送一条本地通知。",
  documentation: {
    overview: "汇集少量不适合独立建模的运行时能力，包括平台识别、回复完成通知和 Android 系统导航栏外观同步。",
    notes: [
      "平台信息来自 Tauri OS 适配层，适合选择行为分支，不应作为安全判断。",
      "移动端导航栏设置在非 Android 平台返回 false，不会模拟成功。",
    ],
    types: [
      {
        name: "PlatformInfo",
        description: "当前桌面或移动运行环境的摘要。",
        definition: `interface PlatformInfo {
  platform: string;
  osType: string;
  family: string;
  arch: string;
  version: string;
}`,
      },
      {
        name: "MobileNavigationBarMode",
        description: "Android 系统导航栏的外观策略。",
        definition: `type MobileNavigationBarMode =
  | "topbar"
  | "system"
  | "light"
  | "dark";`,
      },
    ],
  },
  api: [
    {
      name: "getPlatform",
      signature: "getPlatform(): PlatformInfo",
      description: "返回平台、系统类型、系统家族、架构和版本。",
      returns: "{ platform, osType, family, arch, version }",
      example: "misc.getPlatform()",
    },
    {
      name: "notify",
      signature: "notify(input?: { title?: string; body?: string }): Promise<void>",
      description: "在系统允许时发送本地通知。",
      example: "await misc.notify({ title: '完成', body: '任务已处理' })",
    },
    {
      name: "setMobileNavigationBar",
      signature: "setMobileNavigationBar(mode: 'topbar' | 'system' | 'light' | 'dark'): Promise<boolean>",
      description: "仅 Android 生效。topbar 会跟随当前顶栏明暗模式。",
      example: "await misc.setMobileNavigationBar('topbar')",
    },
  ],
};
