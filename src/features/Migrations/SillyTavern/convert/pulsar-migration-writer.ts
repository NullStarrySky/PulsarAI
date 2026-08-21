import type { Pinia } from "pinia";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { useModelConnectionStore } from "@/features/ModelConnection/services/model-connection-store";
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginParentPath,
  type Plugin,
  type PluginFile,
} from "@/features/Plugin/tree/plugin-types";
import type { PluginConfig } from "@/features/Plugin/editors/config/plugin-config";
import { pluginPathSelectionValue } from "@/features/Plugin/tree/plugin-path-selection";
import type {
  ConversationMigrationArtifact,
  MigratedLorebookEntry,
} from "./migration-artifact";
import type {
  CharacterPackagePlacement,
  GlobalPluginPlacement,
  SillyTavernPlacementPlan,
} from "./placement-plan";
import type { SillyTavernReaderTransport } from "./source-types";
import type {
  ChatMessage,
  ChatMessageContainer,
} from "@/features/Conversation/messages/conversation-types";

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
    const entryFolder = ensureFolder(plugin, "", "entry");
    for (const preset of placement.presets ?? []) {
      const folder = ensureFolder(plugin, entryFolder, safeName(preset.name));
      upsertFile(plugin, folder, `${safeName(preset.name)}.chat.json`, { message: preset.messages });
      for (const [index, document] of preset.depthDocuments.entries()) {
        upsertFile(
          plugin,
          folder,
          `depth-${document.depth}-${String(index + 1).padStart(3, "0")}-${safeName(document.name)}.md`,
          document.content,
          {
            order: document.order,
            insertion: { slot: `depth:${document.depth}`, condition: "false" },
          },
        );
      }
      upsertFile(plugin, folder, `${safeName(preset.name)}.regex.json`, preset.regexRules);
      upsertFile(plugin, folder, "configuration.json", preset.rawConfiguration);
    }
    const backgroundFolder = ensureFolder(plugin, "", pluginConventions.backgroundFolder);
    let selectedBackground: string | null = null;
    for (const background of placement.backgrounds ?? []) {
      const dataUrl = await this.readDataUrl(background.path);
      const name = safeName(background.name);
      upsertFile(plugin, backgroundFolder, name, {
        kind: "media",
        url: dataUrl,
        mediaType: dataUrl.startsWith("data:video/") ? "video" : "image",
      }, {
        insertion: { slot: "background" },
      });
      if (background.selected) {
        selectedBackground = pluginPathSelectionValue(`${pluginConventions.backgroundFolder}/${name}`);
      }
    }
    const actionsFolder = ensureFolder(plugin, "", pluginConventions.actionFolder);
    const quickRepliesFolder = ensureFolder(plugin, actionsFolder, "quick-replies");
    for (const quickReply of placement.quickReplies ?? []) {
      upsertFile(
        plugin,
        quickRepliesFolder,
        uniqueFileName(plugin, quickRepliesFolder, safeName(quickReply.name), "md"),
        quickReply.content,
        { insertion: { slot: "COMMAND" } },
      );
    }
    if (selectedBackground) {
      const config = findPluginNodeByPath(plugin, pluginConventions.config);
      if (config?.kind === "file" && config.content && typeof config.content === "object") {
        const entry = (config.content as PluginConfig).background;
        if (entry) entry.value = selectedBackground;
      }
    }
    const migrationFolder = ensureFolder(plugin, "", "migration");
    upsertFile(plugin, migrationFolder, `sillytavern-public-${Date.now()}.json`, {
      source: "SillyTavern",
      presets: placement.presets?.map((item) => ({
        name: item.name,
        source: item.source,
        diagnostics: item.diagnostics,
      })) ?? [],
      backgrounds: placement.backgrounds?.map((item) => ({ name: item.name, source: item.source })) ?? [],
      quickReplies: placement.quickReplies?.map((item) => ({
        name: item.name,
        setName: item.setName,
        source: item.source,
      })) ?? [],
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
  const characterFolder = ensureFolder(plugin, "", "character");
  upsertFile(plugin, characterFolder, "main.md", placement.artifact.characterMarkdown, {
    insertion: { slot: "context" },
  });
  const userFolder = ensureFolder(plugin, characterFolder, "user");
  for (const persona of placement.personas) {
    upsertFile(plugin, userFolder, `${safeName(persona.name)}.md`, persona.markdown || `# ${persona.name}`, {
      insertion: { slot: "user" },
    });
  }
  const lorebooksFolder = ensureFolder(plugin, "", "lorebooks");
  const embeddedFolder = ensureFolder(plugin, lorebooksFolder, "embedded");
  writeLorebookEntries(plugin, embeddedFolder, placement.artifact.name, placement.artifact.embeddedLorebooks);
  for (const worldbook of placement.claimedWorldbooks) {
    writeLorebookEntries(plugin, lorebooksFolder, worldbook.name, worldbook.entries);
  }
  const regexFile = findPluginNodeByPath(plugin, pluginConventions.regex);
  if (regexFile?.kind === "file") regexFile.content = placement.artifact.regexRules;
  const defaultChat = findPluginNodeByPath(plugin, "default.chat.json");
  if (defaultChat?.kind === "file") {
    defaultChat.content = { message: [{ role: "system", content: "[[ chat ]]" }] };
  }
  const generate = findPluginNodeByPath(plugin, "generate.js");
  if (generate?.kind === "file") generate.content = sillyTavernGenerateSource();
  const migrationFolder = ensureFolder(plugin, "", "migration");
  upsertFile(plugin, migrationFolder, "sillytavern-import-report.json", {
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
  const slots = findPluginNodeByPath(plugin, pluginConventions.slots);
  if (slots?.kind === "file") {
    slots.content = {
      slots: [{
        id: "context",
        title: "世界书上下文",
        scope: "global",
        description: "从 SillyTavern 世界书导入的上下文条目。",
        contentSuffixes: ["md"],
        selectionMode: "none",
        overrideStrategy: "override",
      }],
    };
  }
  const lorebooks = ensureFolder(plugin, "", "lorebooks");
  if (placement.worldbook) {
    writeLorebookEntries(plugin, lorebooks, placement.worldbook.name, placement.worldbook.entries);
  }
  const migrationFolder = ensureFolder(plugin, "", "migration");
  upsertFile(plugin, migrationFolder, "sillytavern-import-report.json", {
    source: placement.worldbook?.source,
    unconsumedFields: placement.worldbook?.unconsumedFields ?? [],
    diagnostics: placement.worldbook?.diagnostics ?? [],
  });
}

function writeLorebookEntries(plugin: Plugin, parentPath: string, bookName: string, entries: MigratedLorebookEntry[]) {
  const folder = ensureFolder(plugin, parentPath, safeName(bookName));
  for (const [index, entry] of entries.entries()) {
    upsertFile(plugin, folder, `${String(index + 1).padStart(3, "0")}-${safeName(entry.name)}.md`, entry.content, {
      order: entry.order,
      ...(entry.enabled
        ? { insertion: { slot: entry.insertionTarget, ...(entry.condition ? { condition: entry.condition } : {}) } }
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

function siblingCount(plugin: Plugin, parentPath: string) {
  return plugin.nodes.filter((node) => pluginParentPath(node.path) === parentPath).length;
}

function ensureFolder(plugin: Plugin, parentPath: string, name: string): string {
  const path = parentPath ? `${parentPath}/${name}` : name;
  const existing = plugin.nodes.find(
    (node) => node.kind === "folder" && node.path === path,
  );
  if (existing) return path;
  plugin.nodes.push({
    id: crypto.randomUUID(),
    path,
    name,
    icon: "",
    treeOrder: siblingCount(plugin, parentPath),
    kind: "folder",
    collapsed: false,
  });
  return path;
}

function upsertFile(
  plugin: Plugin,
  parentPath: string,
  name: string,
  content: unknown,
  input: Pick<PluginFile, "order" | "insertion"> | { order?: number; insertion?: PluginFile["insertion"] } = {},
) {
  const path = parentPath ? `${parentPath}/${name}` : name;
  const existing = plugin.nodes.find(
    (node) => node.kind === "file" && node.path === path,
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
    path,
    name,
    icon: "",
    treeOrder: siblingCount(plugin, parentPath),
    kind: "file",
    content: structuredClone(content),
    order: input.order ?? 100,
    ...(input.insertion ? { insertion: structuredClone(input.insertion) } : {}),
  };
  plugin.nodes.push(file);
  return file;
}

function safeName(value: string) {
  const normalized = value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ");
  return normalized || "untitled";
}

function uniqueFileName(plugin: Plugin, parentPath: string, base: string, extension: string) {
  const existing = new Set(plugin.nodes
    .filter((node) => node.kind === "file" && pluginParentPath(node.path) === parentPath)
    .map((node) => node.name.toLocaleLowerCase()));
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const candidate = `${base}${suffix}.${extension}`;
    if (!existing.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

function sillyTavernGenerateSource() {
  const source = [
    'const localContext = await slot.import("context", "local");',
    'const globalContext = await slot.import("context", "global");',
    'const depth0 = await slot.import("depth:0", "global");',
    'const depth1 = await slot.import("depth:1", "global");',
    'const depth2 = await slot.import("depth:2", "global");',
    'const depth3 = await slot.import("depth:3", "global");',
    'const depth4 = await slot.import("depth:4", "global");',
    'const depth5 = await slot.import("depth:5", "global");',
    'const depth6 = await slot.import("depth:6", "global");',
    'const regexRules = await slot.import("REGEX", "global").then((items) => items.flatMap((value) => Array.isArray(value) ? value : []));',
    "const applyRules = (text, role, depth) => regexRules.reduce((current, rule) => {",
    "  if (!rule || rule.applyOnRending) return current;",
    '  if (rule.range !== "all" && !(rule.range === "user_input" && role === "user") && !(rule.range === "ai_output" && role === "assistant")) return current;',
    '  const min = rule.depth_min === "INF" ? 1 : Number(rule.depth_min || 1);',
    '  const max = rule.depth_max === "INF" ? Infinity : Number(rule.depth_max || Infinity);',
    "  if (depth < Math.min(min, max) || depth > Math.max(min, max)) return current;",
    "  try { const match = /^\\/(.*)\\/([a-z]*)$/.exec(rule.find_regex); return current.replace(match ? new RegExp(match[1], match[2]) : new RegExp(rule.find_regex, 'g'), rule.replace_regex || ''); } catch { return current; }",
    "}, text);",
    'const config = await imports("@/config.json");',
    "const prepared = (await memory.prepare({ compressionThreshold: Number(config.compressionThreshold?.value) || 0 })).messages.map((message, index, all) => ({ ...message, content: typeof message.content === 'string' ? applyRules(message.content, message.role, all.length - index) : message.content }));",
    "const history = [...prepared];",
    "const depthBlocks = [depth0, depth1, depth2, depth3, depth4, depth5, depth6];",
    "depthBlocks.forEach((blocks, depth) => { if (blocks.length) history.splice(Math.max(0, history.length - depth), 0, { role: 'system', content: blocks.map(String).join('\\n\\n') }); });",
    "const context = [...localContext, ...globalContext].filter(Boolean).map(String).join('\\n\\n');",
    "const messages = [...bootstrapMessages, ...(context ? [{ role: 'system', content: context }] : []), ...compileChat(await imports('./default.chat.json'), { chat: history, CHAT: history })];",
    "const runner = new agent.ToolLoopAgent({ container: reply });",
    "await runner.stream({ messages });",
    "  const complete = reply.read().message.content;",
    "  await reply.setContent(applyRules(complete, 'assistant', 1));",
  ];
  return source.join("\n");
}
