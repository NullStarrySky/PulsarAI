import pluginGuide from "@/features/Resources/Plugin/guide.md?raw";
import conversationGuide from "@/features/Resources/Conversation/guide.md?raw";
import {
  findPluginNodeByPath,
  type Plugin,
  type PluginFile,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type {
  CharacterPackage,
  ChatMessageContainer,
  Conversation,
} from "../domain/conversation-types";

function textContent(file?: PluginFile | null) {
  if (!file) return "";
  if (typeof file.content === "string") return file.content;
  return JSON.stringify(file.content, null, 2);
}

function pluginFile(plugin: Plugin, path: string) {
  const prefix = `/plugins/${plugin.id}`;
  const relative = path.startsWith(prefix)
    ? path.slice(prefix.length)
    : path;
  const segments = relative.split("/").filter(Boolean);
  const node = segments.length
    ? findPluginNodeByPath(plugin.root, segments)
    : plugin.root;
  return node?.kind === "file" ? node : null;
}

function rootFile(plugin: Plugin, name: string) {
  const node = findPluginNodeByPath(plugin.root, [name]);
  return node?.kind === "file" ? node : null;
}

export function buildConversationResourceContext(
  conversation: Conversation,
  plugins: Plugin[],
  packages: CharacterPackage[],
  conversations: Conversation[],
  containers: ChatMessageContainer[],
) {
  const binding = conversation.binding;
  if (!binding) return "";

  const executionPackage = packages.find(
    (item) => item.id === conversation.packageId,
  );
  const resourcePackage = binding.packageId
    ? packages.find((item) => item.id === binding.packageId)
    : null;
  const sections = [
    "# Bound resource context",
    `Conversation kind: ${conversation.kind}`,
    `Execution package: ${executionPackage?.name ?? conversation.packageId} (${conversation.packageId})`,
    `Resource title: ${binding.resourceTitle}`,
    `Resource type: ${binding.resourceType}`,
    `Resource id: ${binding.resourceId}`,
    `Resource path: ${binding.resourcePath}`,
    `Resource package: ${
      resourcePackage
        ? `${resourcePackage.name} (${resourcePackage.id})`
        : "global / no owning package"
    }`,
    "Treat the following resource and documentation as authoritative context for this conversation. Inspect the bound resource before proposing changes.",
  ];

  if (binding.resourceType === "plugin" || binding.pluginId) {
    const plugin = plugins.find(
      (item) => item.id === (binding.pluginId ?? binding.resourceId),
    );
    if (plugin) {
      sections.push(
        "## Plugin metadata",
        JSON.stringify(
          {
            id: plugin.id,
            name: plugin.name,
            packageId: plugin.packageId,
            enabled: plugin.enabled,
            main: plugin.main,
            shortDescription: plugin.shortDescription,
          },
          null,
          2,
        ),
      );
      const selected = pluginFile(plugin, binding.resourcePath);
      if (selected) {
        sections.push(
          `## Current plugin file: ${binding.resourcePath}`,
          textContent(selected),
        );
      }
      const info = rootFile(plugin, "info.md");
      if (info && info.id !== selected?.id) {
        sections.push("## Plugin info.md", textContent(info));
      }
      const agents = rootFile(plugin, "AGENTS.md");
      if (agents && agents.id !== selected?.id) {
        sections.push("## Plugin AGENTS.md", textContent(agents));
      }
    }
    sections.push("## Plugin system documentation", pluginGuide);
  } else {
    if (binding.resourceType === "conversation") {
      const target = conversations.find((item) => item.id === binding.resourceId);
      if (target) {
        const path: ChatMessageContainer[] = [];
        const seen = new Set<string>();
        let current = containers.find(
          (item) => item.id === (target.lastContainerId ?? target.rootContainerId),
        );
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          path.unshift(current);
          current = current.previousContainer
            ? containers.find((item) => item.id === current?.previousContainer)
            : undefined;
        }
        sections.push(
          "## Current conversation resource",
          JSON.stringify(
            {
              ...target,
              messages: path.map((container) => ({
                role: container.role,
                content:
                  container.activeMessage === null
                    ? ""
                    : container.content[container.activeMessage]?.content ?? "",
              })),
            },
            null,
            2,
          ),
        );
      }
    } else if (
      binding.resourceType === "project"
      || binding.resourcePath === "/project.json"
    ) {
      if (resourcePackage) {
        sections.push(
          "## Current project resource",
          JSON.stringify(
            {
              id: resourcePackage.id,
              name: resourcePackage.name,
              description: resourcePackage.description,
              icon: resourcePackage.icon,
              categoryId: resourcePackage.categoryId ?? null,
              capabilities: resourcePackage.capabilities,
              globalPluginOrder: resourcePackage.globalPluginOrder ?? [],
            },
            null,
            2,
          ),
        );
      }
    }
    sections.push("## Conversation system documentation", conversationGuide);
  }

  return sections.filter(Boolean).join("\n\n");
}
