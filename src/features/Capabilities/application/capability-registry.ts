import * as about from "@/features/About/capabilities";
import * as agent from "@/features/Agent/capabilities";
import * as backup from "@/features/Backup/capabilities";
import * as database from "@/features/Database/capabilities";
import * as defaultConfigs from "@/features/defaultConfigs/capabilities";
import * as hotkey from "@/features/Hotkey/capabilities";
import * as misc from "@/features/Misc/capabilities";
import * as modelConnection from "@/features/ModelConnection/capabilities";
import * as notification from "@/features/Notification/capabilities";
import * as resources from "@/features/Resources/capabilities";
import * as component from "@/features/Resources/Component/capabilities";
import * as conversation from "@/features/Resources/Conversation/capabilities";
import * as contextDocument from "@/features/Resources/InteractiveDoc/capabilities";
import * as plugin from "@/features/Resources/Plugin/capabilities";
import * as preset from "@/features/Resources/Preset/capabilities";
import * as sandbox from "@/features/Sandbox/capabilities";
import * as globals from "@/features/Sandbox/global-capabilities";
import * as setting from "@/features/Setting/capabilities";
import * as statistic from "@/features/Statistic/capabilities";
import * as subWindow from "@/features/SubWindow/capabilities";
import * as translate from "@/features/Translate/capabilities";
import * as ui from "@/features/UI/capabilities";
import {
  capabilities as capabilitySystemDefinition,
  builder as capabilitySystemBuilder,
} from "../self-capabilities";
import type {
  CapabilityModule,
  CapabilityRuntime,
} from "../domain/capability";

const blockedCapabilityMethods: Record<string, Set<string>> = {
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
  preset: new Set(["execute"]),
  resources: new Set(["deleteFile"]),
  sandbox: new Set(["execute"]),
};

const featureApiBootstrap = [
  "# Pulsar Feature API",
  "公开的 Feature API 始终位于 environment.<featureId> 与 environment.capabilities.<featureId>。",
  "调用 readDocs() 查看目录；调用 readDocs(featureId) 或 readDocs(featureId, apiName) 按需读取类型、签名、可用状态与说明。",
  "少数具有外部副作用、破坏性或任意执行能力的 API 会标记为 blocked，并且不会出现在运行时对象中。",
].join("\n\n");

export const capabilityModules: CapabilityModule[] = [
  { capabilities: capabilitySystemDefinition, builder: capabilitySystemBuilder },
  about,
  agent,
  backup,
  database,
  defaultConfigs,
  hotkey,
  misc,
  modelConnection,
  notification,
  resources,
  component,
  conversation,
  contextDocument,
  plugin,
  preset,
  sandbox,
  globals,
  setting,
  statistic,
  subWindow,
  translate,
  ui,
];

export const capabilityDefinitions = capabilityModules.map(
  (module) => module.capabilities,
);

export function buildCapabilityRuntime(): CapabilityRuntime {
  const apiObjects: Record<string, unknown> = {};

  for (const module of capabilityModules) {
    const featureId = module.capabilities.id;
    const subCapIds = Object.keys(module.capabilities.subCaps).filter(
      (id) => id !== "all",
    );
    const [api] = module.builder(subCapIds);
    const blocked = blockedCapabilityMethods[featureId] ?? new Set<string>();
    const available = Object.fromEntries(
      Object.entries(api).filter(([name]) => !blocked.has(name)),
    );
    if (Object.keys(available).length > 0) {
      apiObjects[featureId] = available;
    }
  }

  const readDocs = createCapabilityDocsReader();

  return {
    environment: {
      ...apiObjects,
      capabilities: apiObjects,
      readDocs,
    },
    prompt: featureApiBootstrap,
  };
}

export function createCapabilityDocsReader() {
  return (featureId?: string, apiName?: string) => {
    if (!featureId) {
      return capabilityDefinitions.map((definition) => ({
        id: definition.id,
        title: definition.title,
        description: definition.description,
      }));
    }
    const definition = capabilityDefinitions.find((item) => item.id === featureId);
    if (!definition) return null;
    const blocked = blockedCapabilityMethods[definition.id] ?? new Set<string>();
    const api = Object.values(definition.api).flat().map((item) => ({
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
      id: definition.id,
      title: definition.title,
      description: definition.description,
      documentation: structuredClone(definition.documentation),
      subCaps: structuredClone(definition.subCaps),
      api,
    };
  };
}
