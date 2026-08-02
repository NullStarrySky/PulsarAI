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
  CapabilityGrants,
  CapabilityModule,
  CapabilityRuntime,
} from "../domain/capability";
import { composeCapabilityRuntimePrompt } from "../domain/capability";
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

  const prompt = composeCapabilityRuntimePrompt(prompts);

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
