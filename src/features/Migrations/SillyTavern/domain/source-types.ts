import type { MigrationDiagnostic, MigrationSourceReference } from "./migration-diagnostic";

export type SillyTavernResourceKind =
  | "character"
  | "chat"
  | "worldbook"
  | "preset"
  | "regex"
  | "settings"
  | "user-persona"
  | "background"
  | "theme"
  | "macro"
  | "unknown";

export type SillyTavernPresetKind =
  | "openai"
  | "textgen"
  | "kobold"
  | "novel"
  | "context"
  | "instruct"
  | "sysprompt"
  | "reasoning"
  | "unknown";

export interface MigrationSourceEntry {
  path: string;
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number | null;
}

export interface MigrationScanResult {
  rootPath: string;
  isFile: boolean;
  entries: MigrationSourceEntry[];
}

export interface SillyTavernDiscrimination {
  kind: SillyTavernResourceKind;
  confidence: number;
  evidence: string[];
  alternatives: SillyTavernResourceKind[];
  presetKind?: SillyTavernPresetKind;
}

export interface SillyTavernParsedResource {
  id: string;
  source: MigrationSourceReference;
  entry: MigrationSourceEntry;
  discrimination: SillyTavernDiscrimination;
  value?: unknown;
  text?: string;
  mediaType?: string;
}

export interface SillyTavernCharacterSource extends SillyTavernParsedResource {
  discrimination: SillyTavernDiscrimination & { kind: "character" };
  value: Record<string, unknown>;
  nickname: string;
  characterName: string;
  avatarPath?: string;
  boundWorldbookNames: string[];
}

export interface SillyTavernChatSource extends SillyTavernParsedResource {
  discrimination: SillyTavernDiscrimination & { kind: "chat" };
  value: SillyTavernChatPayload;
  characterFolderName: string;
}

export interface SillyTavernChatPayload {
  header: Record<string, unknown>;
  messages: Record<string, unknown>[];
}

export interface SillyTavernWorldbookSource extends SillyTavernParsedResource {
  discrimination: SillyTavernDiscrimination & { kind: "worldbook" };
  value: Record<string, unknown>;
  name: string;
  embeddedInCharacterId?: string;
}

export interface SillyTavernPresetSource extends SillyTavernParsedResource {
  discrimination: SillyTavernDiscrimination & { kind: "preset" };
  value: Record<string, unknown>;
  name: string;
  presetKind: SillyTavernPresetKind;
}

export interface SillyTavernSourceSnapshot {
  rootPath: string;
  scannedAt: string;
  characters: SillyTavernCharacterSource[];
  chats: SillyTavernChatSource[];
  worldbooks: SillyTavernWorldbookSource[];
  presets: SillyTavernPresetSource[];
  resources: SillyTavernParsedResource[];
  settings: Record<string, unknown> | null;
  diagnostics: MigrationDiagnostic[];
}

export interface SillyTavernReaderTransport {
  scan(path: string): Promise<MigrationScanResult>;
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<{ mediaType: string; base64: string }>;
  readPngCharacter(path: string): Promise<string>;
}
