export {
  buildCapabilityRuntime,
  capabilityModules,
  capabilityDefinitions,
  fallbackCapabilityGrants,
  mergeCapabilityGrants,
} from "./application/capability-registry";
export {
  capabilities,
  builder,
} from "./self-capabilities";
export type {
  CapabilityApiDoc,
  CapabilityBuilder,
  CapabilityDefinition,
  CapabilityGrants,
  CapabilityModule,
  CapabilityRuntime,
} from "./domain/capability";
