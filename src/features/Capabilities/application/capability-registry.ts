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
import * as interactiveDoc from "@/features/Resources/InteractiveDoc/capabilities";
import * as plugin from "@/features/Resources/Plugin/capabilities";
import * as preset from "@/features/Resources/Preset/capabilities";
import * as sandbox from "@/features/Sandbox/capabilities";
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
  CapabilityGrants,
  CapabilityModule,
  CapabilityRuntime,
} from "../domain/capability";
export { fallbackCapabilityGrants } from "../domain/default-grants";

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
  interactiveDoc,
  plugin,
  preset,
  sandbox,
  setting,
  statistic,
  subWindow,
  translate,
  ui,
];

export const capabilityDefinitions = capabilityModules.map(
  (module) => module.capabilities,
);

export function mergeCapabilityGrants(
  defaults: CapabilityGrants,
  overrides?: CapabilityGrants,
): CapabilityGrants {
  if (!overrides) {
    return structuredClone(defaults);
  }
  return Object.fromEntries(
    capabilityDefinitions.map((definition) => [
      definition.id,
      [...(overrides[definition.id] ?? defaults[definition.id] ?? [])],
    ]),
  );
}

export function buildCapabilityRuntime(
  grants: CapabilityGrants,
): CapabilityRuntime {
  const apiObjects: Record<string, unknown> = {};
  const prompts: string[] = [];

  for (const module of capabilityModules) {
    const [api, prompt] = module.builder(grants[module.capabilities.id] ?? []);
    if (Object.keys(api).length > 0) {
      apiObjects[module.capabilities.id] = api;
    }
    if (prompt) {
      prompts.push(prompt);
    }
  }

  const prompt = [
    "# Pulsar Feature API",
    "仅可调用下列已授权 API。API 对象同时位于 `environment.<featureId>` 与 `environment.capabilities.<featureId>`。",
    "优先调用直观的 Feature API；除非明确需要，不要直接访问 database 或执行任意预设源码。",
    ...prompts,
  ].join("\n\n");

  return {
    environment: {
      ...apiObjects,
      capabilities: apiObjects,
      CAPABILITIES_PROMPT: prompt,
      API_DOCUMENTATION: prompt,
    },
    prompt,
    grants: structuredClone(grants),
  };
}
