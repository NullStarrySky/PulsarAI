import type { MigrationDiagnostic, MigrationSourceReference } from "./migration-diagnostic";
import type { SillyTavernPresetKind } from "./source-types";

export interface MigrationArtifactBase {
  id: string;
  source: MigrationSourceReference;
  diagnostics: MigrationDiagnostic[];
  unconsumedFields: string[];
}

export interface MigratedRegexRule {
  find_regex: string;
  replace_regex: string;
  range: "user_input" | "ai_output" | "all";
  depth_min: number | "INF";
  depth_max: number | "INF";
  applyOnRendering: boolean;
}

export interface MigratedLorebookEntry {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  order: number;
  insertionTarget: string;
  condition?: string;
  source: MigrationSourceReference;
}

export interface CharacterPackageMigrationArtifact extends MigrationArtifactBase {
  kind: "character-package";
  name: string;
  nickname: string;
  description: string;
  avatarPath?: string;
  characterMarkdown: string;
  firstMessage: string;
  alternateGreetings: string[];
  embeddedLorebooks: MigratedLorebookEntry[];
  regexRules: MigratedRegexRule[];
  boundWorldbookNames: string[];
}

export interface WorldbookMigrationArtifact extends MigrationArtifactBase {
  kind: "worldbook";
  name: string;
  entries: MigratedLorebookEntry[];
  embeddedInCharacterId?: string;
}

export interface ConversationMigrationMessage {
  role: "assistant" | "user" | "system";
  versions: Array<{
    content: string;
    createdAt: string;
    modelName?: string;
  }>;
  activeVersion: number;
}

export interface ConversationMigrationArtifact extends MigrationArtifactBase {
  kind: "conversation";
  title: string;
  characterName: string;
  userName: string;
  createdAt: string;
  messages: ConversationMigrationMessage[];
}

export interface PresetMigrationArtifact extends MigrationArtifactBase {
  kind: "preset";
  name: string;
  presetKind: SillyTavernPresetKind;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  depthDocuments: Array<{
    identifier: string;
    name: string;
    role: "system" | "user" | "assistant";
    content: string;
    depth: number;
    order: number;
    enabled: boolean;
  }>;
  regexRules: MigratedRegexRule[];
  rawConfiguration: Record<string, unknown>;
}

export interface BackgroundMigrationArtifact extends MigrationArtifactBase {
  kind: "background";
  name: string;
  path: string;
  selected: boolean;
}

export interface UserPersonaMigrationArtifact extends MigrationArtifactBase {
  kind: "user-persona";
  name: string;
  markdown: string;
  avatarPath?: string;
}

export interface QuickReplyMigrationArtifact extends MigrationArtifactBase {
  kind: "quick-reply";
  name: string;
  content: string;
  setName: string;
}

export interface ProviderMigrationArtifact extends MigrationArtifactBase {
  kind: "provider";
  providerId: string;
  name: string;
  baseUrl: string;
  modelIds: string[];
  secretValue?: string;
}

export interface IgnoredMigrationArtifact extends MigrationArtifactBase {
  kind: "ignored";
  reason: string;
  originalKind: string;
}

export type SillyTavernMigrationArtifact =
  | CharacterPackageMigrationArtifact
  | WorldbookMigrationArtifact
  | ConversationMigrationArtifact
  | PresetMigrationArtifact
  | BackgroundMigrationArtifact
  | UserPersonaMigrationArtifact
  | QuickReplyMigrationArtifact
  | ProviderMigrationArtifact
  | IgnoredMigrationArtifact;

export interface SillyTavernConversionResult {
  artifacts: SillyTavernMigrationArtifact[];
  diagnostics: MigrationDiagnostic[];
  globallySelectedWorldbookNames: string[];
}
