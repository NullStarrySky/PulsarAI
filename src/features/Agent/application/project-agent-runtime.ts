import { interactiveDocumentFormatPrompt } from "@/features/Resources/InteractiveDoc/domain/interactive-document-format";
import {
  createCapabilityPrompt,
} from "@/features/Capabilities/domain/capability";
import {
  pluginCapabilitiesDefinition,
} from "@/features/Resources/Plugin/domain/plugin-capability";
import type {
  Conversation,
  ConversationRendererId,
} from "@/features/Resources/Conversation/domain/conversation-types";
import {
  findPluginNodeByPath,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFolder,
  type PluginTreeNode,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type { SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";

export interface ProjectAgentRuntime {
  environment: SandboxEnvironment;
  prompt: string;
}

interface ProjectCreateInput {
  kind?: "file" | "folder";
  name?: string;
  content?: unknown;
  title?: string;
  description?: string;
  rendererId?: ConversationRendererId;
  icon?: string;
  shortDescription?: string;
  priority?: number;
}

interface ProjectWriteInput {
  name?: string;
  description?: string;
  icon?: string;
  categoryId?: string | null;
  title?: string;
  rendererId?: ConversationRendererId;
  shortDescription?: string;
  enabled?: boolean;
  main?: boolean;
  content?: unknown;
  priority?: number;
}

interface ProjectAgentApi {
  listProjects(): unknown[];
  createProject(input?: ProjectCreateInput): Promise<unknown>;
  getSelection(): {
    conversationId: string;
    projectId: string | null;
    projectName: string | null;
  };
  select(projectId: string | null): Promise<unknown>;
  list(path?: string): unknown[];
  read(path: string): unknown;
  create(path: string, input?: ProjectCreateInput): Promise<unknown>;
  mkdir(path: string, name: string): Promise<unknown>;
  write(path: string, input: ProjectWriteInput): Promise<unknown>;
  move(from: string, toFolder: string, beforeName?: string): Promise<unknown>;
  remove(path: string): Promise<unknown>;
}

export async function createProjectAgentRuntime(
  hostConversationId: string,
  options: {
    pluginSubCapIds?: string[];
  } = {},
): Promise<ProjectAgentRuntime> {
  const [
    { useConversationStore },
    { usePluginStore },
    { useLayoutStore },
  ] = await Promise.all([
    import("@/features/Resources/Conversation/application/conversation-store"),
    import("@/features/Resources/Plugin/application/plugin-store"),
    import("@/features/UI/application/layout-store"),
  ]);
  const conversation = useConversationStore();
  const plugins = usePluginStore();
  const layout = useLayoutStore();

  function hostConversation() {
    const host = conversation.conversations.find(
      (item) => item.id === hostConversationId && item.kind === "task",
    );
    if (!host) {
      throw new Error("项目 Agent 会话不存在。");
    }
    return host;
  }

  function selectedProject() {
    const projectId = hostConversation().binding?.packageId;
    if (!projectId) {
      throw new Error("尚未指定项目。先调用 project.select(projectId)。");
    }
    const project = conversation.packages.find(
      (item) => item.id === projectId,
    );
    if (!project) {
      throw new Error("当前项目不存在或已被删除。");
    }
    return project;
  }

  function projectPlugins() {
    const project = selectedProject();
    return plugins.plugins.filter(
      (plugin) => plugin.packageId === project.id && !plugin.builtIn,
    );
  }

  const api: ProjectAgentApi = {
    listProjects() {
      return conversation.packages.map(({ id, name, description, icon, categoryId }) => ({
          id,
          name,
          description,
          icon,
          categoryId,
      }));
    },
    async createProject(input: ProjectCreateInput = {}) {
      const created = await conversation.createPackage(
        {
          name: input.name?.trim() || "新项目",
          description: input.description?.trim(),
          icon: input.icon,
        },
        { activate: false },
      );
      await conversation.updateConversation(hostConversationId, {
        binding: {
          resourceType: "project",
          resourceId: created.id,
          resourcePath: "/project.json",
          resourceTitle: created.name,
          packageId: created.id,
        },
      });
      return api.read("/project.json");
    },
    getSelection() {
      const host = hostConversation();
      const project = conversation.packages.find(
        (item) => item.id === host.binding?.packageId,
      );
      return project
        ? {
            conversationId: host.id,
            projectId: project.id,
            projectName: project.name,
          }
        : {
            conversationId: host.id,
            projectId: null,
            projectName: null,
          };
    },
    async select(projectId: string | null) {
      if (
        projectId
        && !conversation.packages.some(
          (item) => item.id === projectId,
        )
      ) {
        throw new Error("无法选择项目：角色包不存在。");
      }
      await conversation.updateConversation(hostConversationId, {
        binding: projectId
          ? {
              ...(hostConversation().binding ?? {
                resourceType: "project",
                resourceId: projectId,
                resourcePath: "/project.json",
                resourceTitle: conversation.packages.find((item) => item.id === projectId)?.name ?? "项目",
              }),
              packageId: projectId,
            }
          : undefined,
      });
      return api.getSelection();
    },
    list(path = "/") {
      const segments = projectPathSegments(path);
      if (segments.length === 0) {
        const project = selectedProject();
        return [
          { name: "project.json", kind: "file", type: "json" },
          {
            name: "conversations",
            kind: "folder",
            count: conversation.conversations.filter(
              (item) => item.packageId === project.id,
            ).length,
          },
          {
            name: "plugins",
            kind: "folder",
            count: projectPlugins().length,
          },
        ];
      }
      if (segments[0] === "conversations" && segments.length === 1) {
        const project = selectedProject();
        return conversation.conversations
          .filter((item) => item.packageId === project.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((item) => ({
            name: `${item.id}.json`,
            kind: "file",
            type: "conversation",
            id: item.id,
            title: item.title,
            rendererId: item.rendererId ?? "chat",
            updatedAt: item.updatedAt,
          }));
      }
      if (segments[0] === "plugins" && segments.length === 1) {
        return projectPlugins().map((plugin) => ({
          name: plugin.id,
          kind: "folder",
          id: plugin.id,
          title: plugin.name,
          enabled: plugin.enabled,
          main: plugin.main,
        }));
      }
      if (segments[0] === "plugins" && segments[1]) {
        const plugin = requireProjectPlugin(segments[1]);
        const node = resolvePluginPath(plugin, segments.slice(2));
        if (node.kind !== "folder") {
          throw new Error("只能列出文件夹内容。");
        }
        return sortPluginTreeNodes(node.children).map(nodeEntry);
      }
      throw new Error(`无法列出路径：${normalizeProjectPath(path)}`);
    },
    read(path: string) {
      const segments = projectPathSegments(path);
      if (segments.length === 1 && segments[0] === "project.json") {
        const project = selectedProject();
        return {
          id: project.id,
          name: project.name,
          description: project.description,
          icon: project.icon,
          categoryId: project.categoryId ?? null,
          capabilities: project.capabilities,
          globalPluginOrder: project.globalPluginOrder ?? [],
        };
      }
      if (segments[0] === "conversations" && segments[1]) {
        const item = requireProjectConversation(stripJsonExtension(segments[1]));
        return {
          ...clonePlain(item),
          messages: conversation
            .containerPathForConversation(item)
            .map((container) => clonePlain(container)),
        };
      }
      if (segments[0] === "plugins" && segments[1]) {
        const plugin = requireProjectPlugin(segments[1]);
        if (segments.length === 2) {
          return pluginSummary(plugin);
        }
        const node = resolvePluginPath(plugin, segments.slice(2));
        return node.kind === "file"
          ? {
              ...nodeSummary(plugin, node),
              content: clonePlain(node.content),
            }
          : {
              ...nodeSummary(plugin, node),
              children: sortPluginTreeNodes(node.children).map(nodeEntry),
            };
      }
      throw new Error(`无法读取路径：${normalizeProjectPath(path)}`);
    },
    async create(path: string, input: ProjectCreateInput = {}) {
      const segments = projectPathSegments(path);
      const project = selectedProject();
      if (segments.length === 1 && segments[0] === "conversations") {
        const created = await conversation.createConversation(project.id, {
          activate: false,
          title: input.title?.trim() || "新对话",
          rendererId: input.rendererId,
        });
        return api.read(`/conversations/${created.id}.json`);
      }
      if (segments.length === 1 && segments[0] === "plugins") {
        const created = await plugins.createPlugin(project.id);
        await plugins.updatePlugin(created.id, {
          name: input.name?.trim() || created.name,
          icon: input.icon ?? created.icon,
          shortDescription:
            input.shortDescription ?? created.shortDescription,
        });
        return pluginSummary(created);
      }
      if (segments[0] === "plugins" && segments[1]) {
        const plugin = requireProjectPlugin(segments[1]);
        const parent = resolvePluginFolder(plugin, segments.slice(2));
        const name = input.name?.trim();
        if (!name) {
          throw new Error("创建插件节点时必须提供 name。");
        }
        const created = input.kind === "folder"
            ? await plugins.createFolder(plugin.id, parent.id, name)
            : await plugins.createFile(plugin.id, parent.id, {
              name,
              content: input.content ?? "",
              priority: input.priority,
            });
        if (!created) {
          throw new Error("创建插件节点失败。");
        }
        return nodeSummary(plugin, created);
      }
      throw new Error(`无法在路径创建资源：${normalizeProjectPath(path)}`);
    },
    async mkdir(path: string, name: string) {
      return api.create(path, { kind: "folder", name });
    },
    async write(path: string, input: ProjectWriteInput) {
      const segments = projectPathSegments(path);
      if (segments.length === 1 && segments[0] === "project.json") {
        const project = selectedProject();
        await conversation.updatePackage(project.id, {
          ...(typeof input.name === "string" ? { name: input.name } : {}),
          ...(typeof input.description === "string"
            ? { description: input.description }
            : {}),
          ...(typeof input.icon === "string" ? { icon: input.icon } : {}),
          ...("categoryId" in input ? { categoryId: input.categoryId } : {}),
        });
        return api.read("/project.json");
      }
      if (segments[0] === "conversations" && segments[1]) {
        const item = requireProjectConversation(stripJsonExtension(segments[1]));
        await conversation.updateConversation(item.id, {
          ...(typeof input.title === "string" ? { title: input.title } : {}),
          ...(input.rendererId ? { rendererId: input.rendererId } : {}),
        });
        if (typeof input.title === "string") {
          for (const tab of layout.tabs) {
            if (
              tab.resourceType === "conversation"
              && tab.resourceId === item.id
            ) {
              tab.title = item.title;
            }
          }
        }
        return api.read(path);
      }
      if (segments[0] === "plugins" && segments[1]) {
        const plugin = requireProjectPlugin(segments[1]);
        if (segments.length === 2) {
          await plugins.updatePlugin(plugin.id, {
            ...(typeof input.name === "string" ? { name: input.name } : {}),
            ...(typeof input.icon === "string" ? { icon: input.icon } : {}),
            ...(typeof input.shortDescription === "string"
              ? { shortDescription: input.shortDescription }
              : {}),
            ...(typeof input.enabled === "boolean"
              ? { enabled: input.enabled }
              : {}),
            ...(typeof input.main === "boolean" ? { main: input.main } : {}),
          });
          return pluginSummary(plugin);
        }
        const node = resolvePluginPath(plugin, segments.slice(2));
        await plugins.updateNode(plugin.id, node.id, {
          ...(typeof input.name === "string" ? { name: input.name } : {}),
          ...(typeof input.icon === "string" ? { icon: input.icon } : {}),
          ...(typeof input.priority === "number"
            ? { priority: input.priority }
            : {}),
          ...("content" in input ? { content: input.content } : {}),
        });
        return api.read(projectPluginNodePath(plugin, node));
      }
      throw new Error(`无法写入路径：${normalizeProjectPath(path)}`);
    },
    async move(from: string, toFolder: string, beforeName?: string) {
      const fromSegments = projectPathSegments(from);
      const targetSegments = projectPathSegments(toFolder);
      if (
        fromSegments[0] !== "plugins"
        || targetSegments[0] !== "plugins"
        || !fromSegments[1]
        || fromSegments[1] !== targetSegments[1]
      ) {
        throw new Error("只能在同一个插件中移动节点。");
      }
      const plugin = requireProjectPlugin(fromSegments[1]);
      const node = resolvePluginPath(plugin, fromSegments.slice(2));
      const target = resolvePluginFolder(plugin, targetSegments.slice(2));
      const before = beforeName
        ? target.children.find((child) => child.name === beforeName)
        : undefined;
      await plugins.moveNode(plugin.id, node.id, target.id, before?.id);
      return api.read(projectPluginNodePath(plugin, node));
    },
    async remove(path: string) {
      const segments = projectPathSegments(path);
      if (segments.length === 1 && segments[0] === "project.json") {
        const project = selectedProject();
        for (const plugin of [...projectPlugins()]) {
          layout.closeTabsByResource("plugin", plugin.id);
          await plugins.deletePlugin(plugin.id);
        }
        layout.closeTabsByPackage(project.id);
        await conversation.updateConversation(hostConversationId, {
          binding: undefined,
        });
        await conversation.deletePackage(project.id, {
          activateFallback: false,
        });
        return { removed: "/project.json", projectId: project.id };
      }
      if (segments[0] === "conversations" && segments[1]) {
        const item = requireProjectConversation(stripJsonExtension(segments[1]));
        layout.closeTabsByResource("conversation", item.id);
        await conversation.deleteConversation(item.id, {
          activateFallback: false,
        });
        return { removed: normalizeProjectPath(path) };
      }
      if (segments[0] === "plugins" && segments[1]) {
        const plugin = requireProjectPlugin(segments[1]);
        if (segments.length === 2) {
          layout.closeTabsByResource("plugin", plugin.id);
          await plugins.deletePlugin(plugin.id);
        } else {
          const node = resolvePluginPath(plugin, segments.slice(2));
          await plugins.deleteNode(plugin.id, node.id);
        }
        return { removed: normalizeProjectPath(path) };
      }
      throw new Error(`无法删除路径：${normalizeProjectPath(path)}`);
    },
  };

  function requireProjectConversation(conversationId: string): Conversation {
    const project = selectedProject();
    const item = conversation.conversations.find(
      (candidate) =>
        candidate.id === conversationId
        && candidate.packageId === project.id,
    );
    if (!item) {
      throw new Error("项目中不存在该对话。");
    }
    return item;
  }

  function requireProjectPlugin(pluginId: string): Plugin {
    const item = projectPlugins().find((plugin) => plugin.id === pluginId);
    if (!item) {
      throw new Error("项目中不存在该本地插件。");
    }
    return item;
  }

  const selection = api.getSelection();
  const host = hostConversation();
  const projectLabel = selection.projectId
    ? `当前项目是 ${selection.projectName}（${selection.projectId}）。`
    : "当前未指定项目。先根据用户意图选择项目，必要时调用 project.listProjects() 和 project.select(projectId)。";
  const apiDocumentation = projectApiDocumentation();
  const pluginApiDocumentation = createCapabilityPrompt(
    pluginCapabilitiesDefinition,
    options.pluginSubCapIds ?? [],
  );
  const resourceLabel = host.binding
    ? [
        "This is a side-task conversation bound to the current project resource.",
        `Resource title: ${host.binding.resourceTitle}`,
        `Resource type: ${host.binding.resourceType}`,
        `Project path: ${host.binding.resourcePath}`,
        "Inspect that path first and keep the task scoped to it unless the user explicitly broadens the request.",
      ].join("\n")
    : "";
  const prompt = [
    "# PulsarAI Project Agent",
    "You are the project-level Agent inside PulsarAI.",
    projectLabel,
    resourceLabel,
    "Treat the selected character package as a complete role-playing system, not a loose collection of prompts.",
    "Before changing anything, inspect the relevant project paths and infer how its conversations, plugins, context, characters, actions, components, and interactive documents work together.",
    "Translate the user's intent into a coherent system: identity, setting, participant relationships, voice, goals, boundaries, continuity, context assembly, and interaction rules.",
    "When authoring role-playing content, preserve the distinction between system architecture, character facts, scene state, user role, and assistant behavior.",
    "Prefer small, internally consistent edits. Keep existing ids stable, create UUIDs for new structured resources, and read back important writes.",
    "Do not modify global or built-in plugins. The project API is scoped to the selected project's own conversations and local plugins.",
    "Use the single CodeAct tool for project operations. Submit one JavaScript function with an explicit return.",
    "If the request is ambiguous in a way that changes the system design, call await api.askUser(...) inside CodeAct before writing.",
    "Explain the resulting structure and mention the paths changed in the final response.",
    apiDocumentation,
    pluginApiDocumentation,
    interactiveDocumentFormatPrompt,
  ].filter(Boolean).join("\n\n");

  return {
    environment: {
      project: api,
      PROJECT: api,
      PROJECT_AGENT_PROMPT: prompt,
      PROJECT_API_DOCUMENTATION: apiDocumentation,
      PLUGIN_API_DOCUMENTATION: pluginApiDocumentation,
      PROJECT_RESOURCE_PATH: host.binding?.resourcePath ?? "",
      INTERACTIVE_DOCUMENT_FORMAT: interactiveDocumentFormatPrompt,
    },
    prompt,
  };
}

function normalizeProjectPath(path: string) {
  const normalized = `/${path.trim().replace(/\\/g, "/")}`
    .replace(/\/+/g, "/");
  return normalized.length > 1 && normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
}

function projectPathSegments(path: string) {
  return normalizeProjectPath(path).split("/").filter(Boolean);
}

function stripJsonExtension(value: string) {
  return value.replace(/\.json$/i, "");
}

function resolvePluginPath(plugin: Plugin, segments: string[]) {
  if (segments.length === 0) return plugin.root;
  const node = findPluginNodeByPath(plugin.root, segments);
  if (!node) {
    throw new Error(`插件路径不存在：/${segments.join("/")}`);
  }
  return node;
}

function resolvePluginFolder(plugin: Plugin, segments: string[]): PluginFolder {
  const node = resolvePluginPath(plugin, segments);
  if (node.kind !== "folder") {
    throw new Error("目标路径不是文件夹。");
  }
  return node;
}

function nodeEntry(node: PluginTreeNode) {
  return {
    name: node.name,
    kind: node.kind,
    id: node.id,
    type: node.kind === "file" ? pluginFileType(node.name) : "folder",
    ...(node.kind === "file" ? { priority: node.priority } : {}),
  };
}

function nodeSummary(plugin: Plugin, node: PluginTreeNode) {
  return {
    ...nodeEntry(node),
    path: projectPluginNodePath(plugin, node),
    icon: node.icon,
  };
}

function pluginSummary(plugin: Plugin) {
  return {
    id: plugin.id,
    name: plugin.name,
    icon: plugin.icon,
    shortDescription: plugin.shortDescription,
    enabled: plugin.enabled,
    main: plugin.main,
    root: nodeSummary(plugin, plugin.root),
  };
}

function projectPluginNodePath(plugin: Plugin, node: PluginTreeNode) {
  const path = pluginNodePath(plugin.root, node.id);
  return `/plugins/${plugin.id}${path.length ? `/${path.join("/")}` : ""}`;
}

function clonePlain<T>(value: T): T {
  return structuredClone(value);
}

function projectApiDocumentation() {
  return [
    "## Project file API (`environment.project`)",
    "`project.listProjects()` lists selectable non-system character packages.",
    "`await project.createProject({ name, description?, icon? })` creates a character-package project and binds this Agent conversation to it.",
    "`project.getSelection()` returns the project bound to this Agent conversation.",
    "`await project.select(projectId | null)` changes the bound project.",
    "`project.list(path = '/')` lists `/`, `/conversations`, `/plugins`, or a plugin folder.",
    "`project.read(path)` reads `/project.json`, `/conversations/<id>.json`, `/plugins/<pluginId>`, or a plugin node.",
    "`await project.create('/conversations', { title, rendererId })` creates a project conversation without leaving this Agent conversation.",
    "`await project.create('/plugins', { name, icon, shortDescription })` creates a project-local plugin.",
    "`await project.create('/plugins/<pluginId>/<folder>', { kind: 'file' | 'folder', name, content, priority? })` creates a node; file priority defaults to 100.",
    "`await project.mkdir('/plugins/<pluginId>/<folder>', name)` creates a folder.",
    "`await project.write(path, patch)` updates project metadata, conversation metadata, plugin metadata, or a plugin node/content/priority.",
    "`await project.move(fromPath, targetFolderPath, beforeName?)` moves a node inside one plugin.",
    "`await project.remove(path)` removes a project conversation, local plugin, or plugin node.",
    "`await project.remove('/project.json')` deletes the selected project after removing its own conversations and local plugins.",
    "Plugin node paths use names after the plugin id. Read or list a parent before writing.",
  ].join("\n");
}
