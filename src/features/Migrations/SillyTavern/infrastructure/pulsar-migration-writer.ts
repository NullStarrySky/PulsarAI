import type { Pinia } from "pinia";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "@/features/Resources/Plugin/application/plugin-store";
import { useModelConnectionStore } from "@/features/ModelConnection/application/model-connection-store";
import {
  findPluginNodeByPath,
  pluginConventions,
  type Plugin,
  type PluginFile,
  type PluginFolder,
} from "@/features/Resources/Plugin/domain/plugin-types";
import {
  parsePluginManifest,
  setPluginManifestFixedValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import { pluginPathSelectionValue } from "@/features/Resources/Plugin/domain/plugin-path-selection";
import type {
  ConversationMigrationArtifact,
  MigratedLorebookEntry,
} from "../domain/migration-artifact";
import type {
  CharacterPackagePlacement,
  GlobalPluginPlacement,
  SillyTavernPlacementPlan,
} from "../domain/placement-plan";
import type { SillyTavernReaderTransport } from "../domain/source-types";
import type {
  ChatMessage,
  ChatMessageContainer,
} from "@/features/Resources/Conversation/domain/conversation-types";

export interface SillyTavernImportCommitResult {
  planId: string;
  packageIds: string[];
  globalPluginIds: string[];
  providerIds: string[];
}

export class PulsarSillyTavernMigrationWriter {
  constructor(
    private readonly pinia: Pinia,
    private readonly transport: SillyTavernReaderTransport,
  ) {}

  async commit(plan: SillyTavernPlacementPlan): Promise<SillyTavernImportCommitResult> {
    if ([...plan.conflicts, ...plan.diagnostics].some((diagnostic) => diagnostic.severity === "error")) {
      throw new Error("迁移计划仍有阻断错误，请先修复来源或资源对应关系。");
    }
    const conversation = useConversationStore(this.pinia);
    const plugins = usePluginStore(this.pinia);
    const models = useModelConnectionStore(this.pinia);
    await Promise.all([conversation.initialize(), plugins.initialize(), models.initialize()]);
    this.assertNoExistingConflicts(plan, conversation.packages.map((item) => item.id), plugins.plugins.map((item) => item.id), models.providers.map((item) => item.id));

    const createdPackageIds: string[] = [];
    const createdGlobalPluginIds: string[] = [];
    const createdProviderIds: string[] = [];
    const builtinSnapshots = new Map<string, Plugin>();
    for (const placement of plan.globalPlugins.filter((item) => item.existing)) {
      const plugin = plugins.plugins.find((item) => item.id === placement.id);
      if (plugin) builtinSnapshots.set(plugin.id, structuredClone(plugin));
    }
    try {
      for (const placement of plan.packages) {
        createdPackageIds.push(placement.id);
        await this.writePackage(placement);
      }
      for (const placement of plan.globalPlugins) {
        if (placement.existing) {
          await this.extendExistingPlugin(placement);
        } else {
          createdGlobalPluginIds.push(placement.id);
          await this.writeGlobalPlugin(placement);
        }
      }
      for (const provider of plan.providers) {
        createdProviderIds.push(provider.providerId);
        await models.addProvider({
          id: provider.providerId,
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.secretValue,
        });
        for (const modelId of provider.modelIds) {
          await models.addModel(provider.providerId, {
            id: modelId,
            name: modelId,
            apiType: "chat",
          });
        }
      }
      return {
        planId: plan.id,
        packageIds: createdPackageIds,
        globalPluginIds: createdGlobalPluginIds,
        providerIds: createdProviderIds,
      };
    } catch (error) {
      for (const providerId of createdProviderIds.reverse()) {
        await models.deleteProvider(providerId).catch(() => undefined);
      }
      for (const pluginId of createdGlobalPluginIds.reverse()) {
        await plugins.deletePlugin(pluginId).catch(() => undefined);
      }
      for (const packageId of createdPackageIds.reverse()) {
        await conversation.deletePackage(packageId, { activateFallback: false }).catch(() => undefined);
      }
      for (const snapshot of builtinSnapshots.values()) {
        const index = plugins.plugins.findIndex((item) => item.id === snapshot.id);
        if (index >= 0) plugins.plugins.splice(index, 1, structuredClone(snapshot));
        await plugins.persistPlugin(snapshot).catch(() => undefined);
      }
      throw error;
    }
  }

  private assertNoExistingConflicts(
    plan: SillyTavernPlacementPlan,
    packageIds: string[],
    pluginIds: string[],
    providerIds: string[],
  ) {
    const conflicts = [
      ...plan.packages.filter((item) => packageIds.includes(item.id)).map((item) => `角色包 ${item.id}`),
      ...plan.packages.filter((item) => pluginIds.includes(item.pluginId)).map((item) => `插件 ${item.pluginId}`),
      ...plan.globalPlugins.filter((item) => !item.existing && pluginIds.includes(item.id)).map((item) => `插件 ${item.id}`),
      ...plan.providers.filter((item) => providerIds.includes(item.providerId)).map((item) => `服务商 ${item.providerId}`),
    ];
    if (conflicts.length) throw new Error(`目标已存在，迁移不会覆盖：${conflicts.join("、")}`);
  }

  private async writePackage(placement: CharacterPackagePlacement) {
    const conversation = useConversationStore(this.pinia);
    const plugins = usePluginStore(this.pinia);
    const icon = placement.artifact.avatarPath
      ? await this.readDataUrl(placement.artifact.avatarPath)
      : "";
    const packageItem = await conversation.createPackage({
      id: placement.id,
      pluginId: placement.pluginId,
      name: placement.artifact.name,
      nickname: placement.artifact.nickname,
      description: placement.artifact.description,
      icon,
    }, { activate: false });
    const plugin = plugins.plugins.find((item) => item.id === packageItem.pluginId);
    if (!plugin) throw new Error(`迁移创建的角色插件不存在：${packageItem.pluginId}`);
    plugin.name = placement.artifact.name;
    plugin.shortDescription = `从 SillyTavern 角色卡 ${placement.artifact.nickname} 导入`;
    plugin.icon = icon;
    configureLocalPlugin(plugin, placement);
    await plugins.persistPlugin(plugin);
    await conversation.updatePackage(packageItem.id, { mainPluginId: plugin.id });

    for (const chat of placement.conversations) {
      await writeConversation(conversation, placement.id, chat, false);
    }
    const greetings = [placement.artifact.firstMessage, ...placement.artifact.alternateGreetings]
      .filter(Boolean);
    if (greetings.length) {
      const template: ConversationMigrationArtifact = {
        id: `${placement.artifact.id}:template`,
        kind: "conversation",
        source: placement.artifact.source,
        diagnostics: [],
        unconsumedFields: [],
        title: "模板会话",
        characterName: placement.artifact.name,
        userName: "",
        createdAt: new Date().toISOString(),
        messages: [{
          role: "assistant",
          activeVersion: 0,
          versions: greetings.map((content) => ({ content, createdAt: new Date().toISOString() })),
        }],
      };
      await writeConversation(conversation, placement.id, template, true);
    }
  }

  private async writeGlobalPlugin(placement: GlobalPluginPlacement) {
    const plugins = usePluginStore(this.pinia);
    const conversation = useConversationStore(this.pinia);
    let plugin = await plugins.createGlobalPlugin();
    plugin = await plugins.renamePluginId(plugin.id, placement.id) ?? plugin;
    plugin.name = placement.name;
    plugin.shortDescription = "从未被角色认领的 SillyTavern 世界书导入；由角色包单独启用。";
    configureGlobalPlugin(plugin, placement);
    await plugins.persistPlugin(plugin);
    for (const packageId of placement.enabledPackageIds ?? []) {
      const packageItem = conversation.packages.find((item) => item.id === packageId);
      if (!packageItem || packageItem.enabledGlobalPluginIds.includes(plugin.id)) continue;
      await conversation.updatePackage(packageId, {
        enabledGlobalPluginIds: [...packageItem.enabledGlobalPluginIds, plugin.id],
      });
    }
  }

  private async extendExistingPlugin(placement: GlobalPluginPlacement) {
    const plugins = usePluginStore(this.pinia);
    const plugin = plugins.plugins.find((item) => item.id === placement.id);
    if (!plugin) throw new Error(`目标内置插件不存在：${placement.id}`);
    const entryFolder = ensureFolder(plugin.root, "entry");
    for (const preset of placement.presets ?? []) {
      const folder = ensureFolder(entryFolder, safeName(preset.name));
      upsertFile(folder, `${safeName(preset.name)}.chat.json`, { message: preset.messages });
      for (const [index, document] of preset.depthDocuments.entries()) {
        upsertFile(
          folder,
          `depth-${document.depth}-${String(index + 1).padStart(3, "0")}-${safeName(document.name)}.md`,
          document.content,
          {
            order: document.order,
            insertion: { target: `depth:${document.depth}`, condition: "false" },
          },
        );
      }
      upsertFile(folder, `${safeName(preset.name)}.regex.json`, preset.regexRules);
      upsertFile(folder, "configuration.json", preset.rawConfiguration);
    }
    const backgroundFolder = ensureFolder(plugin.root, pluginConventions.backgroundFolder);
    let selectedBackground: string | null = null;
    for (const background of placement.backgrounds ?? []) {
      const dataUrl = await this.readDataUrl(background.path);
      const name = safeName(background.name);
      upsertFile(backgroundFolder, name, {
        kind: "media",
        url: dataUrl,
        mediaType: dataUrl.startsWith("data:video/") ? "video" : "image",
      }, {
        insertion: { target: "background" },
      });
      if (background.selected) {
        selectedBackground = pluginPathSelectionValue(`${pluginConventions.backgroundFolder}/${name}`);
      }
    }
    if (selectedBackground) {
      const manifest = findPluginNodeByPath(plugin.root, pluginConventions.manifest);
      if (manifest?.kind === "file") {
        const parsed = parsePluginManifest(manifest.content);
        setPluginManifestFixedValue(parsed.manifest, "background", selectedBackground);
        manifest.content = parsed.manifest;
      }
    }
    const migrationFolder = ensureFolder(plugin.root, "migration");
    upsertFile(migrationFolder, `sillytavern-public-${Date.now()}.json`, {
      source: "SillyTavern",
      presets: placement.presets?.map((item) => ({
        name: item.name,
        source: item.source,
        diagnostics: item.diagnostics,
      })) ?? [],
      backgrounds: placement.backgrounds?.map((item) => ({ name: item.name, source: item.source })) ?? [],
      note: "预设入口已保留为普通资源；文本内的单纯宏和同步 EJS 已在导入期转换为 JavaScript。",
    });
    await plugins.persistPlugin(plugin);
  }

  private async readDataUrl(path: string) {
    const binary = await this.transport.readBinary(path);
    return `data:${binary.mediaType};base64,${binary.base64}`;
  }
}

function configureLocalPlugin(plugin: Plugin, placement: CharacterPackagePlacement) {
  const root = plugin.root;
  const characterFolder = ensureFolder(root, "character");
  upsertFile(characterFolder, "main.md", placement.artifact.characterMarkdown, {
    insertion: { target: "context" },
  });
  const userFolder = ensureFolder(characterFolder, "user");
  for (const persona of placement.personas) {
    upsertFile(userFolder, `${safeName(persona.name)}.md`, persona.markdown || `# ${persona.name}`, {
      insertion: { target: "context" },
    });
  }
  const lorebooksFolder = ensureFolder(root, "lorebooks");
  const embeddedFolder = ensureFolder(lorebooksFolder, "embedded");
  writeLorebookEntries(embeddedFolder, placement.artifact.name, placement.artifact.embeddedLorebooks);
  for (const worldbook of placement.claimedWorldbooks) {
    writeLorebookEntries(lorebooksFolder, worldbook.name, worldbook.entries);
  }
  const regexFile = findPluginNodeByPath(root, pluginConventions.regex);
  if (regexFile?.kind === "file") regexFile.content = placement.artifact.regexRules;
  const defaultChat = findPluginNodeByPath(root, "default.chat.json");
  if (defaultChat?.kind === "file") {
    defaultChat.content = { message: [{ role: "system", content: "[[ chat ]]" }] };
  }
  const generate = findPluginNodeByPath(root, "generate.js");
  if (generate?.kind === "file") generate.content = sillyTavernGenerateSource();
  const migrationFolder = ensureFolder(root, "migration");
  upsertFile(migrationFolder, "sillytavern-import-report.json", {
    source: placement.artifact.source,
    character: {
      name: placement.artifact.name,
      nickname: placement.artifact.nickname,
      unconsumedFields: placement.artifact.unconsumedFields,
    },
    claimedWorldbooks: placement.claimedWorldbooks.map((item) => ({ name: item.name, source: item.source })),
    conversations: placement.conversations.map((item) => ({ title: item.title, source: item.source })),
    diagnostics: placement.artifact.diagnostics,
    unsupportedTemplateSyntax: placement.artifact.diagnostics
      .filter((item) => item.code === "sillytavern.macro.unsupported" || item.code === "sillytavern.ejs.unsupported"),
  });
}

function configureGlobalPlugin(plugin: Plugin, placement: GlobalPluginPlacement) {
  const containers = findPluginNodeByPath(plugin.root, pluginConventions.containers);
  if (containers?.kind === "file") {
    containers.content = {
      containers: [{
        id: "context",
        title: "世界书上下文",
        scope: "global",
        description: "从 SillyTavern 世界书导入的上下文条目。",
        contentSuffixes: ["md"],
      }],
    };
  }
  const lorebooks = ensureFolder(plugin.root, "lorebooks");
  if (placement.worldbook) {
    writeLorebookEntries(lorebooks, placement.worldbook.name, placement.worldbook.entries);
  }
  const migrationFolder = ensureFolder(plugin.root, "migration");
  upsertFile(migrationFolder, "sillytavern-import-report.json", {
    source: placement.worldbook?.source,
    unconsumedFields: placement.worldbook?.unconsumedFields ?? [],
    diagnostics: placement.worldbook?.diagnostics ?? [],
  });
}

function writeLorebookEntries(parent: PluginFolder, bookName: string, entries: MigratedLorebookEntry[]) {
  const folder = ensureFolder(parent, safeName(bookName));
  for (const [index, entry] of entries.entries()) {
    upsertFile(folder, `${String(index + 1).padStart(3, "0")}-${safeName(entry.name)}.md`, entry.content, {
      order: entry.order,
      ...(entry.enabled
        ? { insertion: { target: entry.insertionTarget, ...(entry.condition ? { condition: entry.condition } : {}) } }
        : {}),
    });
  }
}

async function writeConversation(
  store: ReturnType<typeof useConversationStore>,
  packageId: string,
  artifact: ConversationMigrationArtifact,
  template: boolean,
) {
  const conversation = await store.createConversation(packageId, {
    activate: false,
    title: artifact.title,
    kind: "chat",
  });
  const initial = store.containers.find((item) => item.conversationid === conversation.id);
  if (!initial) throw new Error(`创建会话后没有初始容器：${artifact.title}`);
  const logicalMessages = artifact.messages;
  const containers: ChatMessageContainer[] = logicalMessages.length
    ? logicalMessages.map((message, index) => {
        const id = index === 0 ? initial.id : crypto.randomUUID();
        return {
          id,
          role: message.role,
          conversationid: conversation.id,
          content: message.versions.map((version): ChatMessage => ({
            id: crypto.randomUUID(),
            type: "message",
            content: version.content,
            createdAt: version.createdAt,
            meta: {
              ...(version.modelName
                ? { generateInfo: { modelName: version.modelName, startTime: version.createdAt } }
                : {}),
              steps: [],
            },
          })),
          activeMessage: message.activeVersion,
          availableNextContainer: [],
          activeNextContainer: null,
          previousContainer: null,
        };
      })
    : [initial];
  containers.forEach((container, index) => {
    const previous = containers[index - 1];
    const next = containers[index + 1];
    container.previousContainer = previous?.id ?? null;
    container.activeNextContainer = next?.id ?? null;
  });
  const initialIndex = store.containers.findIndex((item) => item.id === initial.id);
  if (initialIndex >= 0) store.containers.splice(initialIndex, 1, containers[0]!);
  store.containers.push(...containers.slice(1));
  conversation.rootContainerId = containers[0]?.id ?? initial.id;
  conversation.lastContainerId = containers[containers.length - 1]?.id ?? initial.id;
  conversation.createdAt = artifact.createdAt;
  conversation.updatedAt = artifact.createdAt;
  await Promise.all([
    ...containers.map((container) => store.persistContainer(container)),
    store.persistConversation(conversation),
  ]);
  store.syncConversationLink(conversation);
  if (template) await store.updateConversation(conversation.id, { isTemplate: true });
}

function ensureFolder(parent: PluginFolder, name: string): PluginFolder {
  const existing = parent.children.find(
    (item) => item.kind === "folder" && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (existing?.kind === "folder") return existing;
  const folder: PluginFolder = {
    id: crypto.randomUUID(),
    name,
    icon: "",
    treeOrder: parent.children.length,
    kind: "folder",
    children: [],
    collapsed: false,
  };
  parent.children.push(folder);
  return folder;
}

function upsertFile(
  parent: PluginFolder,
  name: string,
  content: unknown,
  input: Pick<PluginFile, "order" | "insertion"> | { order?: number; insertion?: PluginFile["insertion"] } = {},
) {
  const existing = parent.children.find(
    (item) => item.kind === "file" && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  if (existing?.kind === "file") {
    existing.content = structuredClone(content);
    existing.order = input.order ?? existing.order;
    if (input.insertion) existing.insertion = structuredClone(input.insertion);
    else delete existing.insertion;
    return existing;
  }
  const file: PluginFile = {
    id: crypto.randomUUID(),
    name,
    icon: "",
    treeOrder: parent.children.length,
    kind: "file",
    content: structuredClone(content),
    order: input.order ?? 100,
    ...(input.insertion ? { insertion: structuredClone(input.insertion) } : {}),
  };
  parent.children.push(file);
  return file;
}

function safeName(value: string) {
  const normalized = value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ");
  return normalized || "untitled";
}

function sillyTavernGenerateSource() {
  const source = [
    "const readContainer = (container) => container.list().resources.map((path) => container.get(path));",
    'const localContext = readContainer(imports.container("local", "context"));',
    'const globalContext = imports.containers("global", "context").flatMap(readContainer);',
    'const depth0 = imports.containers("global", "depth:0").flatMap(readContainer);',
    'const depth1 = imports.containers("global", "depth:1").flatMap(readContainer);',
    'const depth2 = imports.containers("global", "depth:2").flatMap(readContainer);',
    'const depth3 = imports.containers("global", "depth:3").flatMap(readContainer);',
    'const depth4 = imports.containers("global", "depth:4").flatMap(readContainer);',
    'const depth5 = imports.containers("global", "depth:5").flatMap(readContainer);',
    'const depth6 = imports.containers("global", "depth:6").flatMap(readContainer);',
    'const regexRules = imports.containers("global", "REGEX").flatMap(readContainer).flatMap((value) => Array.isArray(value) ? value : []);',
    "const applyRules = (text, role, depth) => regexRules.reduce((current, rule) => {",
    "  if (!rule || rule.applyOnRending) return current;",
    '  if (rule.range !== "all" && !(rule.range === "user_input" && role === "user") && !(rule.range === "ai_output" && role === "assistant")) return current;',
    '  const min = rule.depth_min === "INF" ? 1 : Number(rule.depth_min || 1);',
    '  const max = rule.depth_max === "INF" ? Infinity : Number(rule.depth_max || Infinity);',
    "  if (depth < Math.min(min, max) || depth > Math.max(min, max)) return current;",
    "  try { const match = /^\\/(.*)\\/([a-z]*)$/.exec(rule.find_regex); return current.replace(match ? new RegExp(match[1], match[2]) : new RegExp(rule.find_regex, 'g'), rule.replace_regex || ''); } catch { return current; }",
    "}, text);",
    "const prepared = (await memory.prepare({ compressionThreshold: Number(imports.config.local('generation', 'compressionThreshold')) || 0 })).messages.map((message, index, all) => ({ ...message, content: typeof message.content === 'string' ? applyRules(message.content, message.role, all.length - index) : message.content }));",
    "const history = [...prepared];",
    "const depthBlocks = [depth0, depth1, depth2, depth3, depth4, depth5, depth6];",
    "depthBlocks.forEach((blocks, depth) => { if (blocks.length) history.splice(Math.max(0, history.length - depth), 0, { role: 'system', content: blocks.map(String).join('\\n\\n') }); });",
    "const context = [...localContext, ...globalContext].filter(Boolean).map(String).join('\\n\\n');",
    "const messages = [...bootstrapMessages, ...(context ? [{ role: 'system', content: context }] : []), ...compileChat(imports.resource('./default.chat.json'), { chat: history, CHAT: history })];",
    "const runtime = await agent.prepare();",
    "const runner = new agent.ToolLoopAgent({ model: runtime.model, reasoning: runtime.reasoning, allowSystemInMessages: true, instructions: runtime.instructions, tools: runtime.tools, stopWhen: runtime.stopWhen, onStepStart: runtime.onStepStart });",
    "try {",
    "  await reply.setModelName(runtime.modelName);",
    "  const result = await runner.stream({ messages });",
    "  let thinking = '';",
    "  for await (const part of result.stream) {",
    "    if (part.type === 'text-delta') await reply.appendContent(part.text);",
    "    else if (part.type === 'reasoning-start') thinking = '';",
    "    else if (part.type === 'reasoning-delta') thinking += part.text;",
    "    else if (part.type === 'reasoning-end' && thinking.trim()) { await reply.addStep({ name: 'thinking', message: thinking }); thinking = ''; }",
    "    else if (part.type === 'error') throw part.error instanceof Error ? part.error : new Error(String(part.error));",
    "    else if (part.type === 'abort') throw new Error(part.reason || '生成已中止。');",
    "  }",
    "  if (thinking.trim()) await reply.addStep({ name: 'thinking', message: thinking });",
    "  const complete = reply.read().message.content;",
    "  await reply.setContent(applyRules(complete, 'assistant', 1));",
    "} finally { await runtime.finish(); }",
  ];
  return source.join("\n");
}
