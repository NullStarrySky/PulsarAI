import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { notifyReplyCompleted } from "./application/reply-completion-notifier";
import {
  getRuntimeArch,
  getRuntimeFamily,
  getRuntimeOsType,
  getRuntimeOsVersion,
  getRuntimePlatform,
} from "./domain/platform";
import {
  syncMobileNavigationBar,
  type MobileNavigationBarMode,
} from "./application/mobile-navigation-bar";

export const capabilities: CapabilityDefinition = {
  id: "misc",
  title: "运行环境",
  description: "读取当前运行平台，或发送一条本地通知。",
  subCaps: {
    all: "全部运行环境权限",
    readPlatform: "读取平台信息",
    notify: "发送本地通知",
    mobileNavigationBar: "设置移动端系统导航栏",
  },
  api: {
    readPlatform: [{
      name: "getPlatform",
      signature: "getPlatform(): PlatformInfo",
      description: "返回平台、系统类型、系统家族、架构和版本。",
      returns: "{ platform, osType, family, arch, version }",
      example: "misc.getPlatform()",
    }],
    notify: [{
      name: "notify",
      signature: "notify(input?: { title?: string; body?: string }): Promise<void>",
      description: "在系统允许时发送本地通知。",
      example: "await misc.notify({ title: '完成', body: '任务已处理' })",
    }],
    mobileNavigationBar: [{
      name: "setMobileNavigationBar",
      signature: "setMobileNavigationBar(mode: 'topbar' | 'system' | 'light' | 'dark'): Promise<boolean>",
      description: "仅 Android 生效。topbar 会跟随当前顶栏明暗模式。",
      example: "await misc.setMobileNavigationBar('topbar')",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("readPlatform") ? {
    getPlatform: () => ({
      platform: getRuntimePlatform(),
      osType: getRuntimeOsType(),
      family: getRuntimeFamily(),
      arch: getRuntimeArch(),
      version: getRuntimeOsVersion(),
    }),
  } : {}),
  ...(granted.has("notify") ? { notify: notifyReplyCompleted } : {}),
  ...(granted.has("mobileNavigationBar") ? {
    setMobileNavigationBar: (mode: MobileNavigationBarMode) =>
      syncMobileNavigationBar(
        mode,
        typeof document !== "undefined"
          && document.documentElement.classList.contains("dark"),
      ),
  } : {}),
}));
