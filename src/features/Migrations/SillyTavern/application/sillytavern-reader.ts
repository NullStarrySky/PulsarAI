import { discriminateSillyTavernResource } from "./sillytavern-discriminator";
import { migrationDiagnostic, type MigrationDiagnostic } from "../domain/migration-diagnostic";
import type {
  MigrationSourceEntry,
  SillyTavernCharacterSource,
  SillyTavernChatPayload,
  SillyTavernChatSource,
  SillyTavernParsedResource,
  SillyTavernPresetSource,
  SillyTavernReaderTransport,
  SillyTavernSourceSnapshot,
  SillyTavernWorldbookSource,
} from "../domain/source-types";

const ignoredDirectorySegments = new Set([
  "backups",
  "thumbnails",
  "cache",
  "vectors",
  "node_modules",
  ".git",
]);
const ignoredTextCompletionPresetSegments = new Set([
  "textgen settings",
  "koboldai settings",
  "novelai settings",
  "context",
  "instruct",
  "sysprompt",
  "reasoning",
]);

export class SillyTavernReader {
  constructor(private readonly transport: SillyTavernReaderTransport) {}

  async read(path: string): Promise<SillyTavernSourceSnapshot> {
    const scan = await this.transport.scan(path);
    const diagnostics: MigrationDiagnostic[] = [];
    const resources: SillyTavernParsedResource[] = [];
    const characters: SillyTavernCharacterSource[] = [];
    const chats: SillyTavernChatSource[] = [];
    const worldbooks: SillyTavernWorldbookSource[] = [];
    const presets: SillyTavernPresetSource[] = [];
    let settings: Record<string, unknown> | null = null;

    const entries = scan.entries.filter((entry) => {
      const segments = normalizedSegments(entry.relativePath);
      const ignored = segments.some(
        (segment) => segment.startsWith("_") || ignoredDirectorySegments.has(segment),
      );
      const nestedCharacterAsset = isNestedCharacterAsset(entry.relativePath);
      const textCompletionPreset = segments.some((segment) => ignoredTextCompletionPresetSegments.has(segment));
      if (ignored) {
        diagnostics.push(migrationDiagnostic(
          "sillytavern.source.ignored-directory",
          "info",
          "备份、缩略图、向量索引或酒馆内部缓存文件不参与资源迁移。",
          sourceReference(entry),
        ));
      }
      if (nestedCharacterAsset) {
        diagnostics.push(migrationDiagnostic(
          "sillytavern.source.ignored-character-asset",
          "info",
          "角色表情或辅助图片不作为独立角色卡迁移。",
          sourceReference(entry),
        ));
      }
      return !ignored && !nestedCharacterAsset && !textCompletionPreset;
    });

    await forEachConcurrent(entries, 12, async (entry) => {
      try {
        const parsed = await this.parseEntry(entry, scan.isFile);
        const kind = parsed.discrimination.kind;
        if (kind === "preset" && parsed.discrimination.presetKind !== "openai") return;
        resources.push(parsed);
        if (kind === "settings" && isRecord(parsed.value)) {
          settings = parsed.value;
        } else if (kind === "character" && isRecord(parsed.value)) {
          const character = toCharacterSource(parsed);
          characters.push(character);
          const embedded = embeddedWorldbook(character);
          if (embedded) worldbooks.push(embedded);
        } else if (kind === "worldbook" && isRecord(parsed.value)) {
          worldbooks.push({
            ...parsed,
            discrimination: { ...parsed.discrimination, kind: "worldbook" },
            value: parsed.value,
            name: fileStem(entry.name),
          });
        } else if (kind === "preset" && isRecord(parsed.value)) {
          presets.push({
            ...parsed,
            discrimination: { ...parsed.discrimination, kind: "preset" },
            value: parsed.value,
            name: fileStem(entry.name),
            presetKind: parsed.discrimination.presetKind ?? "unknown",
          });
        } else if (kind === "chat" && isChatPayload(parsed.value)) {
          chats.push({
            ...parsed,
            discrimination: { ...parsed.discrimination, kind: "chat" },
            value: parsed.value,
            characterFolderName: chatCharacterFolder(entry.relativePath),
          });
        }
        if (parsed.discrimination.alternatives.length) {
          diagnostics.push(migrationDiagnostic(
            "sillytavern.discriminator.ambiguous",
            "warning",
            `资源判别存在备选类型：${parsed.discrimination.alternatives.join("、")}`,
            parsed.source,
            { selected: kind, confidence: parsed.discrimination.confidence },
          ));
        }
        if (kind === "unknown") {
          diagnostics.push(migrationDiagnostic(
            "sillytavern.discriminator.unknown",
            "warning",
            "无法判断该文件对应的酒馆资源类型。",
            parsed.source,
          ));
        }
        if (kind === "macro") {
          diagnostics.push(migrationDiagnostic(
            "sillytavern.macro-resource.unsupported",
            "info",
            "该文件是宏/脚本资源；当前只转换文本字段内的单纯宏，不执行脚本资源。",
            parsed.source,
          ));
        }
      } catch (error) {
        diagnostics.push(migrationDiagnostic(
          "sillytavern.source.parse-failed",
          "error",
          error instanceof Error ? error.message : String(error),
          sourceReference(entry),
        ));
      }
    });

    characters.sort((left, right) => (right.entry.modifiedAt ?? 0) - (left.entry.modifiedAt ?? 0));
    chats.sort((left, right) => (right.entry.modifiedAt ?? 0) - (left.entry.modifiedAt ?? 0));
    resources.sort((left, right) => left.entry.relativePath.localeCompare(right.entry.relativePath, "zh-Hans"));
    worldbooks.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans"));
    presets.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans"));

    return {
      rootPath: scan.rootPath,
      scannedAt: new Date().toISOString(),
      characters,
      chats,
      worldbooks,
      presets,
      resources,
      settings,
      diagnostics,
    };
  }

  private async parseEntry(entry: MigrationSourceEntry, singleFile: boolean): Promise<SillyTavernParsedResource> {
    let text: string | undefined;
    let value: unknown;
    if (entry.extension === "json") {
      text = await this.transport.readText(entry.path);
      value = JSON.parse(text) as unknown;
    } else if (entry.extension === "jsonl") {
      text = await this.transport.readText(entry.path);
      value = parseChatPayload(text, entry);
    } else if (entry.extension === "png" && (singleFile || isDirectCharacterCard(entry.relativePath))) {
      text = await this.transport.readPngCharacter(entry.path);
      value = JSON.parse(text) as unknown;
    }
    const discrimination = discriminateSillyTavernResource(entry, value);
    return {
      id: entry.relativePath,
      source: sourceReference(entry, discrimination.kind),
      entry,
      discrimination,
      value,
      text,
    };
  }
}

function isDirectCharacterCard(relativePath: string) {
  const segments = normalizedSegments(relativePath);
  const characterIndex = segments.lastIndexOf("characters");
  return characterIndex >= 0 && characterIndex === segments.length - 2;
}

function isNestedCharacterAsset(relativePath: string) {
  const segments = normalizedSegments(relativePath);
  const characterIndex = segments.lastIndexOf("characters");
  return characterIndex >= 0
    && characterIndex < segments.length - 2
    && ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"].some(
      (extension) => segments[segments.length - 1]?.endsWith(`.${extension}`),
    );
}

function parseChatPayload(text: string, entry: MigrationSourceEntry): SillyTavernChatPayload {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error(`会话文件为空：${entry.relativePath}`);
  const values = lines.map((line, index) => {
    try {
      const value = JSON.parse(line) as unknown;
      if (!isRecord(value)) throw new Error("行根节点不是对象");
      return value;
    } catch (error) {
      throw new Error(`会话第 ${index + 1} 行不是有效 JSON：${entry.relativePath}：${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const [header, ...messages] = values;
  return { header: header ?? {}, messages };
}

function toCharacterSource(parsed: SillyTavernParsedResource): SillyTavernCharacterSource {
  const card = parsed.value as Record<string, unknown>;
  const data = isRecord(card.data) ? card.data : card;
  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const name = stringValue(data.name) || stringValue(card.name) || fileStem(parsed.entry.name);
  const worldNames = [
    stringValue(extensions.world),
    stringValue(extensions.worldbook),
    stringValue(extensions.worldbook_id),
    stringValue(card.world),
  ].map((value) => value.trim()).filter(Boolean);
  return {
    ...parsed,
    discrimination: { ...parsed.discrimination, kind: "character" },
    value: card,
    nickname: fileStem(parsed.entry.name),
    characterName: name,
    ...(parsed.entry.extension === "png" ? { avatarPath: parsed.entry.path } : {}),
    boundWorldbookNames: [...new Set(worldNames)],
  };
}

function embeddedWorldbook(character: SillyTavernCharacterSource): SillyTavernWorldbookSource | null {
  const data = isRecord(character.value.data) ? character.value.data : character.value;
  if (!isRecord(data.character_book)) return null;
  const value = data.character_book;
  const name = stringValue(value.name) || `${character.characterName} 内嵌世界书`;
  const entry: MigrationSourceEntry = {
    ...character.entry,
    relativePath: `${character.entry.relativePath}#data.character_book`,
    name,
    extension: "json",
    size: 0,
  };
  return {
    id: `${character.id}#character_book`,
    source: {
      ...character.source,
      relativePath: entry.relativePath,
      resourceKind: "worldbook",
      fieldPath: "data.character_book",
    },
    entry,
    discrimination: {
      kind: "worldbook",
      confidence: 1,
      evidence: ["角色卡 data.character_book"],
      alternatives: [],
    },
    value,
    name,
    embeddedInCharacterId: character.id,
  };
}

function chatCharacterFolder(relativePath: string) {
  const segments = relativePath.replace(/\\/g, "/").split("/");
  const index = segments.findIndex((segment) => segment.toLocaleLowerCase() === "chats");
  return index >= 0 ? segments[index + 1] ?? "" : "";
}

function sourceReference(entry: MigrationSourceEntry, resourceKind?: string) {
  return {
    path: entry.path,
    relativePath: entry.relativePath,
    ...(resourceKind ? { resourceKind } : {}),
  };
}

function normalizedSegments(path: string) {
  return path.replace(/\\/g, "/").split("/").map((segment) => segment.toLocaleLowerCase());
}

function fileStem(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChatPayload(value: unknown): value is SillyTavernChatPayload {
  return isRecord(value) && isRecord(value.header) && Array.isArray(value.messages);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function forEachConcurrent<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (index < values.length) {
      const current = values[index];
      index += 1;
      if (current !== undefined) await task(current);
    }
  });
  await Promise.all(workers);
}
