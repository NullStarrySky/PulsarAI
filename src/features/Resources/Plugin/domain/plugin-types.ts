export type PluginResourceSelectable = "none" | "single" | "multi";

export type PluginResourceKind = "markdown" | "media" | "component" | "action" | "tool" | (string & {});

export interface PluginMetaEntry {
  id: string;
  key: string;
  value: string;
}

export interface PluginResourceCondition {
  id: string;
  functionName: string;
  arguments: string[];
}

export interface PluginResourceContentControl {
  selectable: PluginResourceSelectable;
  insertable: boolean;
  templatable: boolean;
  importable: boolean;
  importConverter?: string;
  resourcesType: PluginResourceKind;
  defaultResource?: unknown;
  allowFolder: boolean;
}

export interface PluginResource {
  id: string;
  name: string;
  icon: string;
  description: string;
  enabled: boolean;
  inserted: boolean;
  insertPosition: string;
  insertDepth: number;
  insertCondition: PluginResourceCondition[];
  isTemplate: boolean;
  meta: Record<string, unknown>;
  content: unknown;
  order: number;
  folderId?: string | null;
}

export interface PluginResourceContainer {
  id: string;
  name: string;
  icon: string;
  description: string;
  contentControl: PluginResourceContentControl;
  resources: PluginResource[];
  collapsed?: boolean;
}

export interface Plugin {
  id: string;
  packageId: string | null;
  name: string;
  icon: string;
  shortDescription: string;
  description: string;
  meta: PluginMetaEntry[];
  generationProcess?: string;
  resources: PluginResourceContainer[];
  enabled: boolean;
  main: boolean;
  builtIn: boolean;
  order: number;
}

export interface ResolvedPluginAction {
  pluginId: string;
  pluginName: string;
  resource: PluginResource;
}

export const builtinPluginContainerIds = {
  background: "background",
  character: "character",
  contextStructure: "context-structure",
  insertable: "insertable",
  action: "action",
  tool: "tool",
  component: "component",
} as const;
