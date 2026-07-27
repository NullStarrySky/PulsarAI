import type { CapabilityGrants } from "./capability";

export const fallbackCapabilityGrants: CapabilityGrants = {
  capabilitySystem: ["read"],
  about: ["checkEnvironment"],
  agent: ["readTools"],
  defaultConfigs: ["read"],
  hotkey: ["read"],
  misc: ["readPlatform"],
  modelConnection: ["generateText"],
  notification: ["read", "sendInternal"],
  resources: ["read"],
  component: ["createTemplate"],
  conversation: ["read"],
  interactiveDoc: ["compile"],
  plugin: ["read"],
  sandbox: ["execute"],
  setting: ["read"],
  statistic: ["read"],
  translate: ["translate", "readConfig"],
};
