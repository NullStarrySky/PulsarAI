import { migrationDiagnostic, type MigrationDiagnostic, type MigrationSourceReference } from "../domain/migration-diagnostic";
import type {
  BackgroundMigrationArtifact,
  CharacterPackageMigrationArtifact,
  ConversationMigrationArtifact,
  ConversationMigrationMessage,
  IgnoredMigrationArtifact,
  MigratedLorebookEntry,
  MigratedRegexRule,
  PresetMigrationArtifact,
  ProviderMigrationArtifact,
  SillyTavernConversionResult,
  SillyTavernMigrationArtifact,
  UserPersonaMigrationArtifact,
  WorldbookMigrationArtifact,
} from "../domain/migration-artifact";
import type {
  SillyTavernCharacterSource,
  SillyTavernParsedResource,
  SillyTavernPresetSource,
  SillyTavernSourceSnapshot,
  SillyTavernWorldbookSource,
} from "../domain/source-types";
import {
  convertExternalTemplateText,
  type ExternalTemplateContext,
} from "./external-template-converter";

export function convertSillyTavernSnapshot(
  snapshot: SillyTavernSourceSnapshot,
): SillyTavernConversionResult {
  const artifacts: SillyTavernMigrationArtifact[] = [];
  const diagnostics = [...snapshot.diagnostics];
  const lorebookDefaults = worldbookDefaults(snapshot.settings);
  const selectedBackground = selectedBackgroundName(snapshot.settings);
  const globalRegexRules = convertGlobalRegex(snapshot, diagnostics);

  for (const character of snapshot.characters) {
    const artifact = convertCharacter(character, lorebookDefaults);
    artifact.regexRules.push(...structuredClone(globalRegexRules));
    artifacts.push(artifact);
    diagnostics.push(...artifact.diagnostics);
  }
  for (const worldbook of snapshot.worldbooks) {
    const artifact = convertWorldbook(worldbook, Boolean(worldbook.embeddedInCharacterId), lorebookDefaults);
    artifacts.push(artifact);
    diagnostics.push(...artifact.diagnostics);
  }
  for (const chat of snapshot.chats) {
    const artifact = convertConversation(chat);
    artifacts.push(artifact);
    diagnostics.push(...artifact.diagnostics);
  }
  for (const preset of snapshot.presets) {
    if (preset.presetKind !== "openai") continue;
    const artifact = convertPreset(preset);
    artifacts.push(artifact);
    diagnostics.push(...artifact.diagnostics);
  }
  appendArtifacts(artifacts, diagnostics, convertPersonas(snapshot));
  appendArtifacts(artifacts, diagnostics, convertProviders(snapshot));

  for (const resource of snapshot.resources) {
    if (resource.discrimination.kind === "background") {
      appendArtifacts(artifacts, diagnostics, [backgroundArtifact(
        resource,
        normalizedResourceName(resource.entry.name) === normalizedResourceName(selectedBackground),
      )]);
    } else if (["theme", "macro"].includes(resource.discrimination.kind)) {
      const artifact = ignoredArtifact(
        resource,
        resource.discrimination.kind === "theme"
          ? "SillyTavern 主题 CSS 和 PulsarAI 主题结构不同，不自动迁移。"
          : "宏/脚本资源不执行；文本字段内的单纯宏由公共模板转换器处理。",
      );
      artifacts.push(artifact);
      diagnostics.push(...artifact.diagnostics);
    }
  }
  if (
    selectedBackground
    && !artifacts.some((artifact) => artifact.kind === "background" && artifact.selected)
  ) {
    diagnostics.push(migrationDiagnostic(
      "sillytavern.background.selected-missing",
      "warning",
      `当前背景“${selectedBackground}”未在 backgrounds 资源中找到，保留 PulsarAI 现有背景选择。`,
      {
        ...(snapshot.resources.find((resource) => resource.discrimination.kind === "settings")?.source ?? {
          path: "settings.json",
          relativePath: "settings.json",
          resourceKind: "settings",
        }),
        fieldPath: "background.name",
      },
    ));
  }

  return {
    artifacts,
    diagnostics,
    globallySelectedWorldbookNames: globallySelectedWorldbooks(snapshot.settings),
  };
}

interface WorldbookDefaults {
  scanDepth: number;
  caseSensitive: boolean;
  matchWholeWords: boolean;
}

function worldbookDefaults(settings?: Record<string, unknown> | null): WorldbookDefaults {
  const worldInfo = settings && isRecord(settings.world_info_settings)
    ? settings.world_info_settings
    : {};
  return {
    scanDepth: Math.max(1, Math.round(numberValue(worldInfo.world_info_depth, 2))),
    caseSensitive: booleanValue(worldInfo.world_info_case_sensitive, false),
    matchWholeWords: booleanValue(worldInfo.world_info_match_whole_words, false),
  };
}

function selectedBackgroundName(settings?: Record<string, unknown> | null) {
  const background = settings && isRecord(settings.background) ? settings.background : {};
  return stringValue(background.name);
}

function appendArtifacts(
  target: SillyTavernMigrationArtifact[],
  diagnostics: MigrationDiagnostic[],
  artifacts: SillyTavernMigrationArtifact[],
) {
  target.push(...artifacts);
  artifacts.forEach((artifact) => diagnostics.push(...artifact.diagnostics));
}

function convertGlobalRegex(
  snapshot: SillyTavernSourceSnapshot,
  diagnostics: MigrationDiagnostic[],
) {
  const rules: MigratedRegexRule[] = [];
  if (snapshot.settings) {
    const extensionSettings = isRecord(snapshot.settings.extension_settings)
      ? snapshot.settings.extension_settings
      : {};
    const source = snapshot.resources.find((item) => item.discrimination.kind === "settings")?.source ?? {
      path: "settings.json",
      relativePath: "settings.json",
      resourceKind: "settings",
    };
    rules.push(...convertRegexCollection(
      extensionSettings.regex ?? snapshot.settings.regex,
      source,
      diagnostics,
      { characterFileName: "" },
    ));
  }
  for (const resource of snapshot.resources) {
    if (resource.discrimination.kind !== "regex" || !resource.value) continue;
    rules.push(...convertRegexCollection(
      resource.value,
      resource.source,
      diagnostics,
      { characterFileName: "" },
    ));
  }
  return rules;
}

function globallySelectedWorldbooks(settings?: Record<string, unknown> | null) {
  if (!settings) return [];
  const worldInfoSettings = isRecord(settings.world_info_settings) ? settings.world_info_settings : {};
  const nested = isRecord(worldInfoSettings.world_info) ? worldInfoSettings.world_info : {};
  return [...new Set([
    ...stringArray(worldInfoSettings.globalSelect),
    ...stringArray(worldInfoSettings.global_select),
    ...stringArray(nested.globalSelect),
    ...stringArray(nested.global_select),
  ])];
}

function convertCharacter(
  source: SillyTavernCharacterSource,
  lorebookDefaults: WorldbookDefaults,
): CharacterPackageMigrationArtifact {
  const card = source.value;
  const data = isRecord(card.data) ? card.data : card;
  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const diagnostics: MigrationDiagnostic[] = [];
  const templateContext = characterTemplateContext(data, source.nickname);
  const embedded = isRecord(data.character_book)
    ? convertWorldbookValue(
        data.character_book,
        `${source.characterName} 内嵌世界书`,
        source.source,
        true,
        diagnostics,
        templateContext,
        lorebookDefaults,
      )
    : [];
  const regexRules = convertRegexCollection(
    extensions.regex_scripts ?? extensions.regexScripts,
    source.source,
    diagnostics,
    templateContext,
  );
  const description = stringValue(data.description);
  const markdownSections: Array<[string, string, string]> = [
    ["角色描述", "description", description],
    ["性格", "personality", stringValue(data.personality)],
    ["场景", "scenario", stringValue(data.scenario)],
    ["系统提示", "system_prompt", stringValue(data.system_prompt)],
    ["历史后指令", "post_history_instructions", stringValue(data.post_history_instructions)],
    ["对话示例", "mes_example", stringValue(data.mes_example)],
    ["创作者说明", "creator_notes", stringValue(data.creator_notes)],
  ];
  const tags = stringArray(data.tags);
  if (tags.length) markdownSections.push(["标签", "tags", tags.join("、")]);
  const creator = stringValue(data.creator);
  if (creator) markdownSections.push(["创作者", "creator", creator]);

  return {
    id: `character:${source.id}`,
    kind: "character-package",
    source: source.source,
    diagnostics,
    unconsumedFields: unconsumedKeys(data, [
      "name", "description", "personality", "scenario", "first_mes", "mes_example",
      "creator_notes", "system_prompt", "post_history_instructions", "alternate_greetings",
      "group_only_greetings", "tags", "creator", "character_version", "extensions", "character_book",
    ]),
    name: source.characterName,
    nickname: source.nickname,
    description,
    avatarPath: source.avatarPath,
    characterMarkdown: markdownSections
      .filter(([, , content]) => content.trim())
      .map(([title, field, content]) => `## ${title}\n\n${convertExternalText(
        content.trim(),
        source.source,
        diagnostics,
        templateContext,
        `data.${field}`,
      )}`)
      .join("\n\n"),
    firstMessage: convertExternalText(
      stringValue(data.first_mes),
      source.source,
      diagnostics,
      templateContext,
      "data.first_mes",
    ),
    alternateGreetings: stringArray(data.alternate_greetings).map((content, index) => convertExternalText(
      content,
      source.source,
      diagnostics,
      templateContext,
      `data.alternate_greetings.${index}`,
    )),
    embeddedLorebooks: embedded,
    regexRules,
    boundWorldbookNames: source.boundWorldbookNames,
  };
}

function convertWorldbook(
  source: SillyTavernWorldbookSource,
  embedded: boolean,
  lorebookDefaults: WorldbookDefaults,
): WorldbookMigrationArtifact {
  const diagnostics: MigrationDiagnostic[] = [];
  return {
    id: `worldbook:${source.id}`,
    kind: "worldbook",
    source: source.source,
    diagnostics,
    unconsumedFields: unconsumedKeys(source.value, ["name", "description", "entries", "extensions"]),
    name: source.name,
    entries: convertWorldbookValue(
      source.value,
      source.name,
      source.source,
      embedded,
      diagnostics,
      { characterFileName: "" },
      lorebookDefaults,
    ),
    embeddedInCharacterId: source.embeddedInCharacterId,
  };
}

function convertWorldbookValue(
  value: Record<string, unknown>,
  bookName: string,
  source: MigrationSourceReference,
  embedded: boolean,
  diagnostics: MigrationDiagnostic[],
  templateContext: ExternalTemplateContext,
  defaults: WorldbookDefaults,
) {
  const rawEntries = Array.isArray(value.entries)
    ? value.entries
    : isRecord(value.entries)
      ? Object.values(value.entries)
      : [];
  return rawEntries.flatMap((raw, index): MigratedLorebookEntry[] => {
    if (!isRecord(raw)) {
      diagnostics.push(migrationDiagnostic(
        "sillytavern.worldbook.entry-invalid",
        "warning",
        `${bookName} 的第 ${index + 1} 个条目不是对象。`,
        { ...source, fieldPath: `entries.${index}` },
      ));
      return [];
    }
    const content = convertExternalText(
      stringValue(raw.content),
      source,
      diagnostics,
      templateContext,
      `entries.${index}.content`,
    );
    if (!content.trim()) {
      diagnostics.push(migrationDiagnostic(
        "sillytavern.worldbook.entry-empty",
        "warning",
        `${bookName} 的第 ${index + 1} 个条目内容为空。`,
        { ...source, fieldPath: `entries.${index}.content` },
      ));
    }
    const position = numberValue(raw.position, 0);
    const depth = clamp(Math.round(numberValue(raw.depth, 4)), 0, 6);
    const enabled = !embedded && raw.disable !== true && raw.enabled !== false;
    const condition = lorebookCondition(raw, defaults, diagnostics, {
      ...source,
      fieldPath: `entries.${index}`,
    });
    if (![0, 1, 4].includes(position)) {
      diagnostics.push(migrationDiagnostic(
        "sillytavern.worldbook.position-approximated",
        "warning",
        `世界书位置 ${position} 没有直接对应项，已放入 context 容器。`,
        { ...source, fieldPath: `entries.${index}.position` },
      ));
    }
    return [{
      id: String(raw.uid ?? raw.id ?? index),
      name: stringValue(raw.comment) || stringValue(raw.name) || `条目 ${index + 1}`,
      content,
      enabled,
      order: Math.round(numberValue(raw.order, 100)),
      insertionTarget: position === 4 ? `depth:${depth}` : "context",
      condition,
      source: { ...source, fieldPath: `entries.${index}` },
    }];
  });
}

function lorebookCondition(
  entry: Record<string, unknown>,
  defaults: WorldbookDefaults,
  diagnostics: MigrationDiagnostic[],
  source: MigrationSourceReference,
) {
  if (entry.constant === true) {
    return entry.useProbability === true && numberValue(entry.probability, 100) < 100
      ? `probability(${clamp(numberValue(entry.probability, 100), 0, 100)})`
      : undefined;
  }
  const depth = Math.max(1, Math.round(numberValue(entry.scanDepth ?? entry.scan_depth, defaults.scanDepth)));
  const caseSensitive = booleanValue(entry.caseSensitive ?? entry.case_sensitive, defaults.caseSensitive);
  const matchWholeWords = booleanValue(entry.matchWholeWords ?? entry.match_whole_words, defaults.matchWholeWords);
  const primary = stringArray(entry.key).map((key) =>
    `include(${JSON.stringify(worldbookKeyword(key, caseSensitive, matchWholeWords))}, ${depth})`
  );
  const secondary = stringArray(entry.keysecondary ?? entry.secondary_key)
    .map((key) => `include(${JSON.stringify(worldbookKeyword(key, caseSensitive, matchWholeWords))}, ${depth})`);
  if (!primary.length) {
    diagnostics.push(migrationDiagnostic(
      "sillytavern.worldbook.no-activation-key",
      "warning",
      "非恒定世界书条目没有主关键词，保持关闭条件。",
      source,
    ));
    return "false";
  }
  const primaryExpression = `(${primary.join(" || ")})`;
  let expression = primaryExpression;
  if (secondary.length) {
    const anySecondary = `(${secondary.join(" || ")})`;
    const allSecondary = `(${secondary.join(" && ")})`;
    switch (Math.round(numberValue(entry.selectiveLogic ?? entry.selective_logic, 0))) {
      case 1:
        expression = `${primaryExpression} && !${allSecondary}`;
        break;
      case 2:
        expression = `${primaryExpression} && !${anySecondary}`;
        break;
      case 3:
        expression = `${primaryExpression} && ${allSecondary}`;
        break;
      default:
        expression = `${primaryExpression} && ${anySecondary}`;
    }
  }
  if (entry.useProbability === true && numberValue(entry.probability, 100) < 100) {
    expression = `(${expression}) && probability(${clamp(numberValue(entry.probability, 100), 0, 100)})`;
  }
  return expression;
}

function convertConversation(source: SillyTavernSourceSnapshot["chats"][number]): ConversationMigrationArtifact {
  const header = source.value.header;
  const diagnostics: MigrationDiagnostic[] = [];
  const characterName = stringValue(header.character_name) || source.characterFolderName;
  const templateContext: ExternalTemplateContext = {
    characterFileName: source.characterFolderName || characterName,
    userName: stringValue(header.user_name),
  };
  const messages = source.value.messages.flatMap((message, index): ConversationMigrationMessage[] => {
    const content = convertExternalText(
      stringValue(message.mes),
      source.source,
      diagnostics,
      templateContext,
      `messages.${index}.mes`,
    );
    const extra = isRecord(message.extra) ? message.extra : {};
    const swipes = stringArray(message.swipes ?? extra.swipes).map((content, swipeIndex) => convertExternalText(
      content,
      source.source,
      diagnostics,
      templateContext,
      `messages.${index}.swipes.${swipeIndex}`,
    ));
    const versions = [content, ...swipes]
      .filter((item, itemIndex, values) => values.indexOf(item) === itemIndex)
      .map((text, versionIndex) => ({
        content: text,
        createdAt: parseDate(stringValue(message.send_date), source.entry.modifiedAt),
        ...(versionIndex === 0 && stringValue(extra.model) ? { modelName: stringValue(extra.model) } : {}),
      }));
    if (!versions.length) {
      diagnostics.push(migrationDiagnostic(
        "sillytavern.chat.empty-message",
        "warning",
        `会话第 ${index + 1} 条消息没有正文或 swipe。`,
        { ...source.source, fieldPath: `messages.${index}` },
      ));
      return [];
    }
    const requestedActive = Math.round(numberValue(message.swipe_id ?? extra.swipe_id, 0));
    return [{
      role: message.is_system === true ? "system" : message.is_user === true ? "user" : "assistant",
      versions,
      activeVersion: clamp(requestedActive, 0, versions.length - 1),
    }];
  });
  return {
    id: `conversation:${source.id}`,
    kind: "conversation",
    source: source.source,
    diagnostics,
    unconsumedFields: unconsumedKeys(header, ["character_name", "user_name", "create_date", "chat_metadata"]),
    title: source.entry.name.replace(/\.jsonl$/, ""),
    characterName,
    userName: stringValue(header.user_name),
    createdAt: parseDate(stringValue(header.create_date), source.entry.modifiedAt),
    messages,
  };
}

function convertPreset(source: SillyTavernPresetSource): PresetMigrationArtifact {
  const diagnostics: MigrationDiagnostic[] = [];
  const templateContext: ExternalTemplateContext = { characterFileName: "" };
  const rawConfiguration = convertExternalJsonValue(
    source.value,
    source.source,
    diagnostics,
    templateContext,
  ) as Record<string, unknown>;
  const messages: PresetMigrationArtifact["messages"] = [];
  const depthDocuments: PresetMigrationArtifact["depthDocuments"] = [];
  const prompts = Array.isArray(rawConfiguration.prompts) ? rawConfiguration.prompts : [];
  for (const [index, prompt] of prompts.entries()) {
    if (!isRecord(prompt)) continue;
    const content = stringValue(prompt.content);
    if (!content.trim()) continue;
    if (Math.round(numberValue(prompt.injection_position, 0)) === 1) {
      depthDocuments.push({
        identifier: stringValue(prompt.identifier) || `depth-${index + 1}`,
        name: stringValue(prompt.name) || `深度提示 ${index + 1}`,
        role: messageRole(prompt.role),
        content,
        depth: clamp(Math.round(numberValue(prompt.injection_depth, 4)), 0, 6),
        order: Math.round(numberValue(prompt.injection_order, 100)),
        enabled: prompt.enabled !== false,
      });
      continue;
    }
    if (prompt.enabled === false) continue;
    messages.push({ role: messageRole(prompt.role), content });
  }
  const storyString = stringValue(rawConfiguration.story_string);
  const systemPrompt = stringValue(rawConfiguration.content ?? rawConfiguration.system_prompt);
  if (storyString) messages.push({ role: "system", content: storyString });
  if (systemPrompt && !messages.some((message) => message.content === systemPrompt)) {
    messages.push({ role: "system", content: systemPrompt });
  }
  if (!messages.length && ["context", "instruct", "reasoning"].includes(source.presetKind)) {
    diagnostics.push(migrationDiagnostic(
      "sillytavern.preset.configuration-only",
      "info",
      "该预设主要包含格式化/采样配置，已保留原始配置但没有虚构上下文消息。",
      source.source,
    ));
  }
  return {
    id: `preset:${source.id}`,
    kind: "preset",
    source: source.source,
    diagnostics,
    unconsumedFields: [],
    name: source.name,
    presetKind: source.presetKind,
    messages,
    depthDocuments,
    regexRules: convertRegexCollection(
      source.value.regex_scripts ?? (isRecord(source.value.extensions) ? source.value.extensions.regex_scripts : undefined),
      source.source,
      diagnostics,
      templateContext,
    ),
    rawConfiguration,
  };
}

function convertRegexCollection(
  value: unknown,
  source: MigrationSourceReference,
  diagnostics: MigrationDiagnostic[],
  templateContext: ExternalTemplateContext,
): MigratedRegexRule[] {
  const rawRules = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  return rawRules.flatMap((raw, index): MigratedRegexRule[] => {
    if (!isRecord(raw) || raw.disabled === true) return [];
    const find = stringValue(raw.findRegex ?? raw.find_regex ?? raw.regex);
    if (!find) return [];
    const placements = Array.isArray(raw.placement) ? raw.placement.map(Number) : [];
    const supportsUser = !placements.length || placements.includes(1);
    const supportsAssistant = !placements.length || placements.includes(2);
    if (placements.some((placement) => ![0, 1, 2].includes(placement))) {
      diagnostics.push(migrationDiagnostic(
        "sillytavern.regex.unsupported-placement",
        "warning",
        "正则包含斜杠命令、世界书或 reasoning 等专用时机，仅迁移用户/AI/显示范围。",
        { ...source, fieldPath: `regex.${index}.placement` },
      ));
    }
    return [{
      find_regex: find,
      replace_regex: convertExternalText(
        stringValue(raw.replaceString ?? raw.replace_with ?? raw.replace_regex).replace(/{{match}}/gi, "$0"),
        source,
        diagnostics,
        templateContext,
        `regex.${index}.replace`,
      ),
      range: supportsUser && supportsAssistant ? "all" : supportsUser ? "user_input" : "ai_output",
      depth_min: depthValue(raw.minDepth ?? raw.min_depth, 1),
      depth_max: depthValue(raw.maxDepth ?? raw.max_depth, "INF"),
      applyOnRending: raw.markdownOnly === true || raw.only_format_display === true,
    }];
  });
}

function convertPersonas(snapshot: SillyTavernSourceSnapshot): UserPersonaMigrationArtifact[] {
  if (!snapshot.settings) return [];
  const powerUser = isRecord(snapshot.settings.power_user) ? snapshot.settings.power_user : {};
  const names = isRecord(powerUser.personas) ? powerUser.personas : {};
  const descriptions = isRecord(powerUser.persona_descriptions) ? powerUser.persona_descriptions : {};
  return Object.entries(names).map(([avatar, name]) => {
    const detail = isRecord(descriptions[avatar]) ? descriptions[avatar] : {};
    const diagnostics: MigrationDiagnostic[] = [];
    const source: MigrationSourceReference = {
      path: "settings.json",
      relativePath: "settings.json",
      resourceKind: "user-persona",
      fieldPath: `power_user.personas.${avatar}`,
    };
    return {
      id: `persona:${avatar}`,
      kind: "user-persona",
      source,
      diagnostics,
      unconsumedFields: unconsumedKeys(detail, ["description", "position", "depth", "role", "lorebook"]),
      name: stringValue(name) || avatar.replace(/\.[^.]+$/, ""),
      markdown: convertExternalText(
        stringValue(detail.description),
        source,
        diagnostics,
        { characterFileName: "", userName: stringValue(name) },
        `power_user.persona_descriptions.${avatar}.description`,
      ),
      avatarPath: snapshot.resources.find((resource) => resource.entry.name === avatar)?.entry.path,
    };
  });
}

function characterTemplateContext(
  data: Record<string, unknown>,
  characterFileName: string,
): ExternalTemplateContext {
  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const depthPrompt = isRecord(extensions.depth_prompt)
    ? stringValue(extensions.depth_prompt.prompt)
    : stringValue(extensions.depth_prompt);
  return {
    characterFileName,
    character: {
      description: stringValue(data.description),
      personality: stringValue(data.personality),
      scenario: stringValue(data.scenario),
      systemPrompt: stringValue(data.system_prompt),
      instruction: stringValue(data.post_history_instructions),
      depthPrompt,
      creatorNotes: stringValue(data.creator_notes),
      version: stringValue(data.character_version),
      messageExamples: stringValue(data.mes_example),
      greetings: [stringValue(data.first_mes), ...stringArray(data.alternate_greetings)],
    },
  };
}

function convertExternalText(
  text: string,
  source: MigrationSourceReference,
  diagnostics: MigrationDiagnostic[],
  context: ExternalTemplateContext,
  fieldPath: string,
) {
  if (!text || (!text.includes("{{") && !text.includes("<%"))) return text;
  const converted = convertExternalTemplateText(text, context);
  for (const issue of converted.issues) {
    diagnostics.push(migrationDiagnostic(
      issue.syntax === "sillytavern-macro"
        ? "sillytavern.macro.unsupported"
        : "sillytavern.ejs.unsupported",
      "warning",
      `${issue.name} 未自动迁移：${issue.reason}`,
      { ...source, fieldPath },
      { syntax: issue.syntax, name: issue.name },
    ));
  }
  return converted.text;
}

function convertExternalJsonValue(
  value: unknown,
  source: MigrationSourceReference,
  diagnostics: MigrationDiagnostic[],
  context: ExternalTemplateContext,
  fieldPath = "",
): unknown {
  if (typeof value === "string") {
    return convertExternalText(value, source, diagnostics, context, fieldPath || "$");
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => convertExternalJsonValue(
      item,
      source,
      diagnostics,
      context,
      fieldPath ? `${fieldPath}.${index}` : String(index),
    ));
  }
  if (!isRecord(value)) return structuredClone(value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    convertExternalJsonValue(
      item,
      source,
      diagnostics,
      context,
      fieldPath ? `${fieldPath}.${key}` : key,
    ),
  ]));
}

function convertProviders(snapshot: SillyTavernSourceSnapshot): ProviderMigrationArtifact[] {
  if (!snapshot.settings) return [];
  const oai = isRecord(snapshot.settings.oai_settings) ? snapshot.settings.oai_settings : {};
  const baseUrl = stringValue(oai.custom_url) || stringValue(oai.reverse_proxy);
  if (!baseUrl) return [];
  const source = snapshot.resources.find((resource) => resource.discrimination.kind === "settings")?.source ?? {
    path: "settings.json",
    relativePath: "settings.json",
    resourceKind: "settings",
  };
  const providerId = `sillytavern-${slug(stringValue(oai.chat_completion_source) || "custom")}`;
  const modelIds = [
    stringValue(oai.custom_model),
    stringValue(oai.openai_model),
    stringValue(oai.openrouter_model),
  ].filter(Boolean);
  return [{
    id: `provider:${providerId}`,
    kind: "provider",
    source,
    diagnostics: [migrationDiagnostic(
      "sillytavern.provider.secret-not-copied",
      "info",
      "连接地址已转换；密钥不会从 secrets.json 自动复制，请在模型设置中确认。",
      source,
    )],
    unconsumedFields: [],
    providerId,
    name: `SillyTavern · ${stringValue(oai.chat_completion_source) || "Custom"}`,
    baseUrl,
    modelIds: [...new Set(modelIds)],
  }];
}

function backgroundArtifact(
  resource: SillyTavernParsedResource,
  selected: boolean,
): BackgroundMigrationArtifact {
  return {
    id: `background:${resource.id}`,
    kind: "background",
    source: resource.source,
    diagnostics: [],
    unconsumedFields: [],
    name: resource.entry.name,
    path: resource.entry.path,
    selected,
  };
}

function ignoredArtifact(resource: SillyTavernParsedResource, reason: string): IgnoredMigrationArtifact {
  return {
    id: `ignored:${resource.id}`,
    kind: "ignored",
    source: resource.source,
    diagnostics: [migrationDiagnostic(
      resource.discrimination.kind === "macro" ? "sillytavern.macro-resource.unsupported" : "sillytavern.resource.unsupported",
      "info",
      reason,
      resource.source,
    )],
    unconsumedFields: [],
    reason,
    originalKind: resource.discrimination.kind,
  };
}

function messageRole(value: unknown): "system" | "user" | "assistant" {
  return value === "user" || value === "assistant" ? value : "system";
}

function depthValue(value: unknown, fallback: number | "INF"): number | "INF" {
  if (typeof value === "string" && ["inf", "infinity", "-1"].includes(value.toLocaleLowerCase())) return "INF";
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.max(1, Math.round(number)) : fallback;
}

function parseDate(value: string, fallbackMillis: number | null) {
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date(fallbackMillis ?? Date.now()).toISOString();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function worldbookKeyword(value: string, caseSensitive: boolean, matchWholeWords: boolean) {
  if (/^\/(?:[^/\\]|\\.)+\/[a-z]*$/i.test(value)) return value;
  const needsBoundary = matchWholeWords && !/\s/.test(value.trim());
  if (!caseSensitive && !needsBoundary) return value;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "\\/");
  const source = needsBoundary ? `(?:^|\\W)(?:${escaped})(?:$|\\W)` : escaped;
  return `/${source}/${caseSensitive ? "" : "i"}`;
}

function normalizedResourceName(value: string) {
  return value.trim().replace(/\.[^.]+$/, "").toLocaleLowerCase();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function slug(value: string) {
  const normalized = value.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unconsumedKeys(value: Record<string, unknown>, consumed: string[]) {
  const claimed = new Set(consumed);
  return Object.keys(value).filter((key) => !claimed.has(key));
}
