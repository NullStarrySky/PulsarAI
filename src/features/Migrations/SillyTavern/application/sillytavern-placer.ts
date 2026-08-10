import { migrationDiagnostic, type MigrationDiagnostic } from "../domain/migration-diagnostic";
import type {
  CharacterPackageMigrationArtifact,
  SillyTavernConversionResult,
  SillyTavernMigrationArtifact,
} from "../domain/migration-artifact";
import type {
  CharacterPackagePlacement,
  GlobalPluginPlacement,
  SillyTavernPlacementPlan,
} from "../domain/placement-plan";

const builtinCorePluginId = "builtin-core-plugin";

export function placeSillyTavernArtifacts(
  sourceRoot: string,
  conversion: SillyTavernConversionResult,
): SillyTavernPlacementPlan {
  const diagnostics = [...conversion.diagnostics];
  const conflicts: MigrationDiagnostic[] = [];
  const characters = ofKind(conversion, "character-package");
  const conversations = ofKind(conversion, "conversation");
  const worldbooks = ofKind(conversion, "worldbook");
  const personas = ofKind(conversion, "user-persona");
  const presets = ofKind(conversion, "preset");
  const backgrounds = ofKind(conversion, "background");
  const providers = ofKind(conversion, "provider");
  const usedIds = new Set<string>();

  const packages = characters.map((character): CharacterPackagePlacement => ({
    id: uniqueId(`st-package-${slug(character.nickname || character.name)}`, usedIds),
    pluginId: uniqueId(`st-character-${slug(character.nickname || character.name)}`, usedIds),
    artifact: character,
    conversations: [],
    claimedWorldbooks: [],
    personas: [],
  }));

  reportDuplicateCharacterNames(packages, conflicts);
  for (const conversation of conversations) {
    const candidates = packages.filter((placement) => characterMatches(
      placement.artifact,
      conversation.characterName,
    ));
    if (candidates.length === 1) {
      candidates[0]?.conversations.push(conversation);
    } else {
      conflicts.push(migrationDiagnostic(
        candidates.length ? "sillytavern.placement.chat-character-ambiguous" : "sillytavern.placement.chat-character-missing",
        "error",
        candidates.length
          ? `会话“${conversation.title}”对应到多个角色包。`
          : `会话“${conversation.title}”找不到角色“${conversation.characterName}”。`,
        conversation.source,
        { candidatePackageIds: candidates.map((candidate) => candidate.id) },
      ));
    }
  }

  const claimedWorldbookIds = new Set<string>();
  for (const worldbook of worldbooks) {
    if (worldbook.embeddedInCharacterId) {
      claimedWorldbookIds.add(worldbook.id);
      continue;
    }
    const candidates = packages.filter((placement) => placement.artifact.boundWorldbookNames.some(
      (name) => normalizedName(name) === normalizedName(worldbook.name),
    ));
    for (const placement of candidates) {
      placement.claimedWorldbooks.push(worldbook);
      claimedWorldbookIds.add(worldbook.id);
    }
  }

  for (const persona of personas) {
    const candidates = packages.filter((placement) => placement.conversations.some(
      (conversation) => normalizedName(conversation.userName) === normalizedName(persona.name),
    ));
    if (candidates.length) {
      candidates.forEach((placement) => placement.personas.push(persona));
    } else {
      diagnostics.push(migrationDiagnostic(
        "sillytavern.placement.persona-unclaimed",
        "warning",
        `用户角色“${persona.name}”没有被任何已导入会话使用，暂不复制到角色包。`,
        persona.source,
      ));
    }
  }

  const globallySelectedNames = new Set(
    conversion.globallySelectedWorldbookNames.map(normalizedName),
  );
  const globalPlugins: GlobalPluginPlacement[] = worldbooks
    .filter((worldbook) => !claimedWorldbookIds.has(worldbook.id) || globallySelectedNames.has(normalizedName(worldbook.name)))
    .map((worldbook) => ({
      id: uniqueId(`st-lorebook-${slug(worldbook.name)}`, usedIds),
      name: `世界书 · ${worldbook.name}`,
      existing: false,
      worldbook,
      enabledPackageIds: globallySelectedNames.has(normalizedName(worldbook.name))
        ? packages
            .filter((placement) => !placement.claimedWorldbooks.some((item) => item.id === worldbook.id))
            .map((placement) => placement.id)
        : [],
    }));
  if (presets.length || backgrounds.length) {
    globalPlugins.unshift({
      id: builtinCorePluginId,
      name: "内置核心插件",
      existing: true,
      presets,
      backgrounds,
    });
  }

  return {
    id: crypto.randomUUID(),
    sourceRoot,
    createdAt: new Date().toISOString(),
    packages,
    globalPlugins,
    providers,
    diagnostics,
    conflicts,
    counts: {
      packages: packages.length,
      conversations: packages.reduce((count, placement) => count + placement.conversations.length, 0),
      localWorldbooks: packages.reduce(
        (count, placement) => count
          + placement.claimedWorldbooks.length
          + (placement.artifact.embeddedLorebooks.length ? 1 : 0),
        0,
      ),
      globalWorldbooks: globalPlugins.filter((plugin) => plugin.worldbook).length,
      presets: presets.length,
      backgrounds: backgrounds.length,
      providers: providers.length,
    },
  };
}

function ofKind<K extends SillyTavernMigrationArtifact["kind"]>(
  conversion: SillyTavernConversionResult,
  kind: K,
): Array<Extract<SillyTavernMigrationArtifact, { kind: K }>> {
  return conversion.artifacts.filter(
    (artifact): artifact is Extract<SillyTavernMigrationArtifact, { kind: K }> => artifact.kind === kind,
  );
}

function reportDuplicateCharacterNames(
  packages: CharacterPackagePlacement[],
  conflicts: MigrationDiagnostic[],
) {
  const names = new Map<string, CharacterPackagePlacement[]>();
  for (const placement of packages) {
    const key = normalizedName(placement.artifact.name);
    names.set(key, [...(names.get(key) ?? []), placement]);
  }
  for (const duplicates of names.values()) {
    if (duplicates.length < 2) continue;
    conflicts.push(migrationDiagnostic(
      "sillytavern.placement.character-name-duplicate",
      "error",
      `多个角色卡使用名称“${duplicates[0]?.artifact.name}”，会话关系无法可靠判断。`,
      duplicates[0]?.artifact.source,
      { packageIds: duplicates.map((item) => item.id) },
    ));
  }
}

function characterMatches(character: CharacterPackageMigrationArtifact, name: string) {
  const normalized = normalizedName(name);
  return normalizedName(character.name) === normalized || normalizedName(character.nickname) === normalized;
}

function uniqueId(base: string, used: Set<string>) {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function slug(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || crypto.randomUUID().slice(0, 8);
}

function normalizedName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\.[^.]+$/, "");
}
