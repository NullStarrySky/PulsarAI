import { featureDocs } from "./docs-index";
import type {
  FeatureApiDocResult,
  FeatureApiRuntime,
  FeatureDocs,
  FeatureDocsEntry,
  FeatureDocsResult,
  ReadDocsResult,
} from "./types";
import { detectEnvironmentTools } from "@/features/About/environment-check";
import {
  getAgentExtensionToolNames,
  invokeAgentExtension,
  listAgentExtensions,
} from "@/features/Agent/runtime/agent-extension-registry";
import { useBackupStore } from "@/features/Backup/backup-store";
import { remove, selectAll, selectOne, upsert } from "@/features/Database/database-service";
import {
  getDefaultConfig,
  setDefaultConfig,
} from "@/features/defaultConfigs/default-config-service";
import { defaultConfigKeys, fallbackDefaultConfigs } from "@/features/defaultConfigs/default-config";
import { useCommandStore } from "@/features/Hotkey/command-store";
import {
  getRuntimeArch,
  getRuntimeFamily,
  getRuntimeOsType,
  getRuntimeOsVersion,
  getRuntimePlatform,
} from "@/features/Misc/platform";
import { notifyReplyCompleted } from "@/features/Misc/reply-completion-notifier";
import {
  syncMobileNavigationBar,
  type MobileNavigationBarMode,
} from "@/features/Misc/mobile-navigation-bar";
import { generateText } from "@/features/ModelConnection/services/model-ai";
import { sendNotification } from "@/features/Notification/notification-service";
import { useNotificationStore } from "@/features/Notification/notification-store";
import {
  deleteResourceFile,
  resourceDisplayUrl,
} from "@/features/Resources/resource-file-service";
import { createConversationSandboxApi } from "@/features/Resources/Conversation/generation/sandbox-api";
import { createPluginSandboxApi } from "@/features/Resources/Plugin/runtime/sandbox-api";
import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import { createSandboxGlobalApi } from "@/features/Sandbox/sandbox-globals";
import { getSettingPages } from "@/features/Setting/setting-registry";
import { useStatisticStore } from "@/features/Statistic/statistic-store";
import { popOutTarget } from "@/features/SubWindow/sub-window-service";
import type { SubWindowTarget } from "@/features/SubWindow/sub-window-protocol";
import { useTranslateStore } from "@/features/Translate/translate-store";
import { useLayoutStore } from "@/features/UI/layout-store";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import type { ComposerToolbarLayout } from "@/features/UI/composer-toolbar";
import { webSearch } from "@/features/WebSearch/web-search";

// 按需屏蔽的危险方法：具有外部副作用、破坏性、付费或任意执行能力。
// 这些方法从实际运行时对象中移除，而不只是隐藏文档。
const blockedApiMethods: Record<string, Set<string>> = {
  agent: new Set(["callExtension"]),
  backup: new Set(["create"]),
  conversation: new Set(["create", "send", "pushErrorMessage"]),
  database: new Set(["upsert", "remove"]),
  defaultConfigs: new Set(["set"]),
  hotkey: new Set(["execute"]),
  modelConnection: new Set(["generateText"]),
  notification: new Set(["sendExternal"]),
  plugin: new Set([
    "setMainPlugin",
    "setGlobalPluginEnabled",
    "createContainer",
    "updateContainer",
    "removeContainer",
    "addContainerContent",
    "updateContainerContent",
    "removeContainerContent",
    "setContextDepth",
    "setConfig",
    "replaceManifest",
    "write",
    "create",
    "move",
    "remove",
  ]),
  resources: new Set(["deleteFile"]),
  sandbox: new Set(["execute"]),
};

type DefaultConfigKey = keyof typeof defaultConfigKeys;

const featureApiFactories: Record<string, () => Record<string, unknown>> = {
  docs: () => ({
    list: async () => featureDocs,
    get: async (featureId: string) =>
      featureDocs.find((item) => item.id === featureId) ?? null,
    read_docs: (featureId?: string, apiName?: string) =>
      createDocsReader()(featureId, apiName),
  }),
  about: () => ({ checkEnvironment: detectEnvironmentTools }),
  agent: () => ({
    listTools: getAgentExtensionToolNames,
    listExtensions: listAgentExtensions,
    callExtension: invokeAgentExtension,
  }),
  backup: () => ({
    list: async () => {
      const store = useBackupStore();
      await store.initialize();
      await store.refreshBackups();
      return store.backups;
    },
    create: () => useBackupStore().createLocalBackup(),
  }),
  database: () => ({ selectAll, selectOne, upsert, remove }),
  defaultConfigs: () => ({
    get: <K extends DefaultConfigKey>(key: K) =>
      getDefaultConfig(defaultConfigKeys[key], fallbackDefaultConfigs[key]),
    set: (key: DefaultConfigKey, value: string) =>
      setDefaultConfig(defaultConfigKeys[key], value),
  }),
  hotkey: () => ({
    listCommands: () => useCommandStore().commands.map((command) => ({
      id: command.id,
      title: command.title,
      description: command.description,
      category: command.category,
      defaultHotkey: command.defaultHotkey,
    })),
    execute: (commandId: string) => useCommandStore().executeCommand(commandId),
  }),
  misc: () => ({
    getPlatform: () => ({
      platform: getRuntimePlatform(),
      osType: getRuntimeOsType(),
      family: getRuntimeFamily(),
      arch: getRuntimeArch(),
      version: getRuntimeOsVersion(),
    }),
    notify: notifyReplyCompleted,
    setMobileNavigationBar: (mode: MobileNavigationBarMode) =>
      syncMobileNavigationBar(
        mode,
        typeof document !== "undefined"
          && document.documentElement.classList.contains("dark"),
      ),
  }),
  modelConnection: () => ({
    generateText: async (input: { prompt: string; model?: string; system?: string }) => {
      const { getDefaultChatModel } = await import("@/features/defaultConfigs/default-config-service");
      const result = await generateText({
        model: input.model || await getDefaultChatModel(),
        prompt: input.prompt,
        system: input.system,
      });
      return { text: result.text };
    },
  }),
  notification: () => ({
    list: () => useNotificationStore().items.map((item) => ({ ...item })),
    sendInternal: (input: { title?: string; body?: string; level?: "info" | "success" | "warning" | "error" }) =>
      sendNotification({ ...input, channel: "internal" }),
    sendExternal: (input: { title?: string; body?: string }) =>
      sendNotification({ ...input, channel: "external" }),
  }),
  resources: () => ({
    displayUrl: resourceDisplayUrl,
    deleteFile: deleteResourceFile,
  }),
  conversation: createConversationSandboxApi,
  plugin: createPluginSandboxApi,
  sandbox: () => ({
    execute: (code: string, values: Record<string, unknown> = {}) =>
      executeSandboxCodeAsync(code, [values]),
  }),
  globals: () => createSandboxGlobalApi(),
  setting: () => ({
    list: () => ({
      pages: getSettingPages().map(({ meta, tabs }) => ({
        id: meta.id,
        title: meta.title,
        tabs: tabs?.map(({ id, title }) => ({ id, title })) ?? [],
      })),
    }),
  }),
  statistic: () => ({
    summary: async () => {
      const store = useStatisticStore();
      await store.initialize();
      return {
        messageCount: store.messageCount,
        sizeByType: store.sizeByType,
        sizeByPackage: store.sizeByPackage,
      };
    },
  }),
  subWindow: () => ({
    open: (target: SubWindowTarget, title?: string) => popOutTarget(target, title),
  }),
  translate: () => ({
    text: (value: string) => useTranslateStore().translateText(value),
    getConfig: () => {
      const state = useTranslateStore().state;
      return {
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        provider: state.provider,
      };
    },
  }),
  ui: () => ({
    setSettingsOpen: (open: boolean) => useLayoutStore().setSettingsOpen(open),
    getComposerToolbar: () => structuredClone(useAppearanceStore().composerToolbar),
    setComposerToolbar: (layout: ComposerToolbarLayout) =>
      useAppearanceStore().setComposerToolbar(layout),
  }),
  webSearch: () => ({
    search: (input: { query: string; limit?: number }) => webSearch(input.query, input.limit),
  }),
};

const featureApiBootstrap = [
  "# Pulsar Feature API",
  "公开的 Feature API 始终位于 environment.<featureId> 与 environment.capabilities.<featureId>。",
  "调用 read_docs() 查看目录；调用 read_docs(featureId) 或 read_docs(featureId, apiName) 按需读取类型、签名、可用状态与说明。",
  "少数具有外部副作用、破坏性或任意执行能力的 API 会标记为 blocked，并且不会出现在运行时对象中。",
].join("\n\n");

/**
 * 组装 Sandbox 的完整 Feature API 环境：每个 Feature 全量包含，
 * 仅从 blockedApiMethods 中按需屏蔽危险方法。
 */
export function buildFeatureApiRuntime(): FeatureApiRuntime {
  const apiObjects: Record<string, unknown> = {};

  for (const docs of featureDocs) {
    const factory = featureApiFactories[docs.id];
    if (!factory) continue;
    const api = factory();
    const blocked = blockedApiMethods[docs.id] ?? new Set<string>();
    const available = Object.fromEntries(
      Object.entries(api).filter(([name]) => !blocked.has(name)),
    );
    if (Object.keys(available).length > 0) {
      apiObjects[docs.id] = available;
    }
  }

  const read_docs = createDocsReader();
  const docsApi = apiObjects.docs;
  if (docsApi && typeof docsApi === "object") {
    Object.assign(docsApi, { read_docs });
  }

  return {
    environment: {
      ...apiObjects,
      capabilities: apiObjects,
      read_docs,
    },
    prompt: featureApiBootstrap,
  };
}

export function createDocsReader(): (
  featureId?: string,
  apiName?: string,
) => ReadDocsResult {
  return (featureId?: string, apiName?: string): ReadDocsResult => {
    if (!featureId) {
      return featureDocs.map((docs): FeatureDocsEntry => ({
        id: docs.id,
        title: docs.title,
        description: docs.description,
      }));
    }
    const docs = featureDocs.find((item) => item.id === featureId);
    if (!docs) return null;
    const blocked = blockedApiMethods[docs.id] ?? new Set<string>();
    const api = docs.api.map((item): FeatureApiDocResult => ({
      ...structuredClone(item),
      availability: blocked.has(item.name) ? "blocked" as const : "available" as const,
      ...(blocked.has(item.name)
        ? { reason: "该操作具有外部副作用、破坏性或任意执行能力，不向普通生成环境开放。" }
        : {}),
    }));
    if (apiName) {
      return api.find((item) => item.name === apiName) ?? null;
    }
    return {
      id: docs.id,
      title: docs.title,
      description: docs.description,
      documentation: structuredClone(docs.documentation),
      api,
    } satisfies FeatureDocsResult;
  };
}

export type { FeatureDocs };
