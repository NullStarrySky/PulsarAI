import type { MigrationDiagnostic, MigrationSourceReference } from "../convert/migration-diagnostic";
import {
  convertGlobalRegex,
  convertPersonas,
  convertSillyTavernSnapshot,
} from "../convert/sillytavern-converter";
import { discriminateSillyTavernResource } from "../convert/sillytavern-discriminator";
import type {
  LocalPluginMigrationArtifact,
  MigratedLorebookEntry,
  MigratedRegexRule,
  PresetMigrationArtifact,
} from "../convert/migration-artifact";
import type {
  MigrationSourceEntry,
  SillyTavernCharacterSource,
  SillyTavernPresetSource,
  SillyTavernSourceSnapshot,
  SillyTavernWorldbookSource,
} from "../convert/source-types";

export type StImportKind =
  | "character"
  | "worldbook"
  | "preset"
  | "persona"
  | "regex";

/** One file the import produces; `path` is relative to the generated folder. */
export interface StImportFile {
  path: string;
  content: unknown;
  /** Builtin global slot the file contributes through (character, user, before_char, after_char, document, depth:N, REGEX, chat). */
  slotId?: string;
  condition?: string;
  priority?: number;
  resourceSelected?: boolean;
}

export interface StImportPlan {
  kind: StImportKind;
  /** Generated folder base name; the original filename without its extension. */
  name: string;
  /** "folder" creates `<name>/…`; "file" writes the single file into the target folder. */
  mode: "file" | "folder";
  files: StImportFile[];
  diagnostics: string[];
  /** Character card extras consumed by the package import flow. */
  character?: { name: string; description: string; iconDataUrl?: string };
}

export interface StResourceFileInput {
  base64?: string;
  mediaType?: string;
  text?: string;
}

export interface StResourceFile extends StResourceFileInput {
  fileName: string;
}

/** Reads a SillyTavern resource file through the migration bridge. */
export async function readStResourceFile(
  path: string,
): Promise<StResourceFile> {
  const { host } = await import("@/host");
  const fileName = path.replace(/\\/g, "/").split("/").pop() ?? path;
  const extension = fileExtension(fileName);
  if (extension === "png") {
    const binary = await host.migration.invoke<{
      mediaType: string;
      base64: string;
    }>("readBinary", { path });
    return { fileName, base64: binary.base64, mediaType: binary.mediaType };
  }
  const text = await host.migration.invoke<string>("readText", { path });
  return { fileName, text };
}

/** Classifies one SillyTavern file and converts it into World file specs. */
export function buildStImportPlan(
  fileName: string,
  input: StResourceFileInput,
): StImportPlan {
  const extension = fileExtension(fileName);
  const baseName = safeName(fileName.replace(/\.[^.]+$/, ""));
  const source: MigrationSourceReference = {
    path: fileName,
    relativePath: fileName,
    resourceKind: "st-import",
  };
  const entry: MigrationSourceEntry = {
    path: fileName,
    relativePath: fileName,
    name: fileName,
    extension,
    size: 0,
    modifiedAt: null,
  };

  if (extension === "png") {
    if (!input.base64) throw new Error("缺少 PNG 文件内容。");
    const value = extractPngCharacterJson(input.base64);
    return planFromValue(value, baseName, source, entry, pngDataUrl(input));
  }
  if (extension === "json") {
    if (typeof input.text !== "string") throw new Error("缺少 JSON 文件内容。");
    let value: unknown;
    try {
      value = JSON.parse(input.text);
    } catch {
      throw new Error("JSON 文件解析失败。");
    }
    return planFromValue(value, baseName, source, entry);
  }
  if (["md", "markdown", "txt"].includes(extension)) {
    if (typeof input.text !== "string") throw new Error("缺少文本内容。");
    return personaPlan(baseName, baseName, input.text, source);
  }
  throw new Error(
    `暂不支持导入 ${extension || "未知"} 类型的文件；请选择 PNG、JSON 或 Markdown。`,
  );
}

/** Returns a conversion plan only for files that positively identify as ST. */
export function tryBuildStImportPlan(
  fileName: string,
  input: StResourceFileInput,
): StImportPlan | undefined {
  const extension = fileExtension(fileName);
  if (extension === "png") {
    try {
      return buildStImportPlan(fileName, input);
    } catch {
      return undefined;
    }
  }
  if (extension !== "json" || typeof input.text !== "string") return undefined;

  let value: unknown;
  try {
    value = JSON.parse(input.text);
  } catch {
    return undefined;
  }
  const kind = discriminateSillyTavernResource(
    {
      path: fileName,
      relativePath: fileName,
      name: fileName,
      extension,
      size: 0,
      modifiedAt: null,
    },
    value,
  ).kind;
  if (
    kind !== "character" &&
    kind !== "worldbook" &&
    kind !== "preset" &&
    kind !== "regex"
  )
    return undefined;
  if (!isClearlyStResource(value, kind)) return undefined;
  return buildStImportPlan(fileName, input);
}

function isClearlyStResource(value: unknown, kind: StImportKind) {
  if (kind === "regex") {
    const rules = Array.isArray(value) ? value : [value];
    return rules.some(
      (rule) =>
        isRecord(rule) &&
        ("findRegex" in rule || "find_regex" in rule) &&
        ("replaceString" in rule || "replace_with" in rule),
    );
  }
  if (!isRecord(value)) return false;
  if (kind === "character") {
    const data = isRecord(value.data) ? value.data : value;
    return /^chara_card_v[23]$/i.test(String(value.spec ?? "")) ||
      (typeof data.name === "string" && "first_mes" in data && "description" in data);
  }
  if (kind === "worldbook") {
    const entries = value.entries;
    const values = Array.isArray(entries)
      ? entries
      : isRecord(entries)
        ? Object.values(entries)
        : [];
    return values.some(
      (entry) => isRecord(entry) && "content" in entry && ("key" in entry || "keysecondary" in entry),
    );
  }
  return Array.isArray(value.prompts)
    ? value.prompts.some((prompt) => isRecord(prompt) && "identifier" in prompt)
    : "chat_completion_source" in value;
}

function planFromValue(
  value: unknown,
  baseName: string,
  source: MigrationSourceReference,
  entry: MigrationSourceEntry,
  iconDataUrl?: string,
): StImportPlan {
  const discrimination = discriminateSillyTavernResource(entry, value);
  switch (discrimination.kind) {
    case "character":
      return characterPlan(
        value as Record<string, unknown>,
        baseName,
        source,
        entry,
        iconDataUrl,
      );
    case "worldbook":
      return worldbookPlan(value as Record<string, unknown>, baseName, source, entry);
    case "preset":
      return presetPlan(value as Record<string, unknown>, baseName, source, entry);
    case "regex":
      return regexPlan(value, baseName, source, entry);
    default:
      break;
  }
  if (isRecord(value) && typeof value.description === "string") {
    return personaPlan(
      baseName,
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : baseName,
      value.description,
      source,
    );
  }
  throw new Error(
    `无法识别的 SillyTavern 资源类型（${discrimination.kind}）；支持角色卡、世界书、预设、正则与 persona。`,
  );
}

function characterPlan(
  value: Record<string, unknown>,
  baseName: string,
  source: MigrationSourceReference,
  entry: MigrationSourceEntry,
  iconDataUrl?: string,
): StImportPlan {
  const data = isRecord(value.data) ? value.data : value;
  const snapshot = singleSnapshot();
  const character: SillyTavernCharacterSource = {
    id: "st-import-character",
    source,
    entry,
    discrimination: {
      kind: "character",
      confidence: 1,
      evidence: [],
      alternatives: [],
    },
    value,
    nickname: baseName,
    characterName:
      typeof data.name === "string" && data.name.trim()
        ? data.name.trim()
        : baseName,
    boundWorldbookNames: [],
  };
  snapshot.characters = [character];
  const conversion = convertSillyTavernSnapshot(snapshot);
  const artifact = conversion.artifacts.find(
    (item): item is LocalPluginMigrationArtifact =>
      item.kind === "character-package",
  );
  if (!artifact) throw new Error("角色卡转换失败。");

  const files: StImportFile[] = [];
  let markdown = artifact.characterMarkdown;
  const greetings = [artifact.firstMessage, ...artifact.alternateGreetings];
  if (greetings.some((text) => text.trim())) {
    markdown = `${markdown}\n\n## 开场白\n\n${greetings
      .filter((text) => text.trim())
      .join("\n\n---\n\n")}`;
  }
  files.push({ path: "info.md", content: markdown.trim(), slotId: "character" });
  appendLorebookFiles(files, artifact.embeddedLorebooks);
  if (artifact.regexRules.length) files.push(regexFile(artifact.regexRules));

  return {
    kind: "character",
    name: baseName,
    mode: "folder",
    files,
    diagnostics: artifact.diagnostics.map((item) => item.message),
    character: {
      name: artifact.name,
      description: artifact.description,
      iconDataUrl,
    },
  };
}

function worldbookPlan(
  value: Record<string, unknown>,
  baseName: string,
  source: MigrationSourceReference,
  entry: MigrationSourceEntry,
): StImportPlan {
  const snapshot = singleSnapshot();
  const worldbook: SillyTavernWorldbookSource = {
    id: "st-import-worldbook",
    source,
    entry,
    discrimination: {
      kind: "worldbook",
      confidence: 1,
      evidence: [],
      alternatives: [],
    },
    value,
    name: baseName,
  };
  snapshot.worldbooks = [worldbook];
  const conversion = convertSillyTavernSnapshot(snapshot);
  const artifact = conversion.artifacts.find(
    (item) => item.kind === "worldbook",
  );
  if (!artifact || artifact.kind !== "worldbook") {
    throw new Error("世界书转换失败。");
  }
  const files: StImportFile[] = [];
  appendLorebookFiles(files, artifact.entries);
  if (!files.length) throw new Error("世界书没有可导入的条目。");
  return {
    kind: "worldbook",
    name: baseName,
    mode: "folder",
    files,
    diagnostics: artifact.diagnostics.map((item) => item.message),
  };
}

function presetPlan(
  value: Record<string, unknown>,
  baseName: string,
  source: MigrationSourceReference,
  entry: MigrationSourceEntry,
): StImportPlan {
  const snapshot = singleSnapshot();
  const preset: SillyTavernPresetSource = {
    id: "st-import-preset",
    source,
    entry,
    discrimination: {
      kind: "preset",
      confidence: 1,
      evidence: [],
      alternatives: [],
      presetKind: "openai",
    },
    value,
    name: baseName,
    presetKind: "openai",
  };
  snapshot.presets = [preset];
  const conversion = convertSillyTavernSnapshot(snapshot);
  const artifact = conversion.artifacts.find(
    (item): item is PresetMigrationArtifact => item.kind === "preset",
  );
  if (!artifact) throw new Error("预设转换失败。");

  const files: StImportFile[] = [
    {
      path: "entry.chat.json",
      content: {
        message: artifact.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
      slotId: "chat",
    },
  ];
  for (const [index, document] of artifact.depthDocuments.entries()) {
    files.push({
      path: `depth/${String(index + 1).padStart(3, "0")}-${safeName(document.name)}.md`,
      content: document.content,
      slotId: `depth:${Math.min(document.depth, 4)}`,
      priority: document.order,
      resourceSelected: document.enabled,
    });
  }
  if (artifact.regexRules.length) files.push(regexFile(artifact.regexRules));
  return {
    kind: "preset",
    name: baseName,
    mode: "folder",
    files,
    diagnostics: artifact.diagnostics.map((item) => item.message),
  };
}

function regexPlan(
  value: unknown,
  baseName: string,
  source: MigrationSourceReference,
  entry: MigrationSourceEntry,
): StImportPlan {
  const snapshot = singleSnapshot();
  snapshot.resources = [
    {
      id: "st-import-regex",
      source,
      entry,
      discrimination: {
        kind: "regex",
        confidence: 1,
        evidence: [],
        alternatives: [],
      },
      value,
    },
  ];
  const diagnostics: MigrationDiagnostic[] = [];
  const rules = convertGlobalRegex(snapshot, diagnostics);
  if (!rules.length) throw new Error("没有可导入的正则规则。");
  return {
    kind: "regex",
    name: baseName,
    mode: "file",
    files: [regexFile(rules)],
    diagnostics: diagnostics.map((item) => item.message),
  };
}

function personaPlan(
  baseName: string,
  name: string,
  description: string,
  _source: MigrationSourceReference,
): StImportPlan {
  const snapshot = singleSnapshot();
  snapshot.settings = {
    power_user: {
      personas: { [baseName]: name },
      persona_descriptions: { [baseName]: { description } },
    },
  };
  const artifacts = convertPersonas(snapshot);
  const artifact = artifacts[0];
  const markdown = artifact?.markdown?.trim() || `# ${name}`;
  return {
    kind: "persona",
    name: baseName,
    mode: "file",
    files: [
      {
        path: `${safeName(name)}.md`,
        content: markdown,
        slotId: "user",
      },
    ],
    diagnostics: artifact?.diagnostics.map((item) => item.message) ?? [],
  };
}

function appendLorebookFiles(files: StImportFile[], entries: MigratedLorebookEntry[]) {
  for (const [index, lorebookEntry] of entries.entries()) {
    files.push({
      path: `lorebooks/${String(index + 1).padStart(3, "0")}-${safeName(lorebookEntry.name)}.md`,
      content: lorebookEntry.content,
      slotId: clampDepthSlot(lorebookEntry.insertionTarget),
      condition: lorebookEntry.condition,
      priority: lorebookEntry.order,
      resourceSelected: lorebookEntry.enabled,
    });
  }
}

function regexFile(rules: MigratedRegexRule[]): StImportFile {
  return { path: "regex.json", content: rules, slotId: "REGEX" };
}

/** 内置深度插槽只有 0-4，更深的条目收敛到 depth:4。 */
function clampDepthSlot(insertionTarget: string) {
  const match = /^depth:(\d+)$/.exec(insertionTarget);
  if (!match) return insertionTarget;
  return `depth:${Math.min(Number(match[1]), 4)}`;
}

function singleSnapshot(): SillyTavernSourceSnapshot {
  return {
    rootPath: "",
    scannedAt: new Date().toISOString(),
    characters: [],
    chats: [],
    worldbooks: [],
    presets: [],
    resources: [],
    settings: null,
    diagnostics: [],
  };
}

function pngDataUrl(input: StResourceFileInput) {
  if (!input.base64) return undefined;
  const mediaType = input.mediaType && input.mediaType !== "application/octet-stream"
    ? input.mediaType
    : "image/png";
  return `data:${mediaType};base64,${input.base64}`;
}

/** Extracts the embedded character card JSON (ccv3 preferred, then chara). */
function extractPngCharacterJson(base64: string): unknown {
  const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    binary.length < signature.length ||
    signature.some((byte, index) => binary[index] !== byte)
  ) {
    throw new Error("不是有效的 PNG 文件。");
  }
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const decodeLatin1 = (bytes: Uint8Array) =>
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  let ccv3: string | null = null;
  let chara: string | null = null;
  let offset = signature.length;
  while (offset + 12 <= binary.length) {
    const length = view.getUint32(offset);
    const type = decodeLatin1(binary.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    if (type === "tEXt") {
      const data = binary.slice(dataStart, dataStart + length);
      const separator = data.indexOf(0);
      const keyword = separator >= 0 ? decodeLatin1(data.slice(0, separator)) : "";
      const payload = separator >= 0 ? decodeLatin1(data.slice(separator + 1)) : "";
      if (keyword === "ccv3") ccv3 = payload;
      else if (keyword === "chara") chara = payload;
    }
    if (type === "IEND") break;
    offset = dataStart + length + 4;
  }
  const payloadBase64 = (ccv3 ?? chara)?.trim();
  if (!payloadBase64) {
    throw new Error("PNG 中没有找到角色卡数据（chara/ccv3 文本块）。");
  }
  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(payloadBase64), (char) => char.charCodeAt(0)),
    );
    return JSON.parse(json);
  } catch {
    throw new Error("PNG 角色卡数据解析失败。");
  }
}

function fileExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function safeName(value: string) {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^\$+/, "")
    .replace(/\s+/g, " ");
  return normalized || "untitled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
