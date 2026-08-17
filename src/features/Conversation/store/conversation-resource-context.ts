import pluginGuide from "@/features/Plugin/guide.md?raw";
import conversationGuide from "@/features/Conversation/guide.md?raw";
import {
  findPluginNodeByPath,
  findPluginTreeNode,
  type Plugin,
  type PluginFile,
} from "@/features/Plugin/tree/plugin-types";
import type {
  CharacterPackage,
  ChatMessageContainer,
  Conversation,
} from "@/features/Conversation/messages/conversation-types";
import { normalizeMarkdownLineBreaks } from "@/features/Plugin/shared/markdown";

function textContent(file?: PluginFile | null) {
  if (!file) return "";
  if (typeof file.content === "string") return file.content;
  return JSON.stringify(file.content, null, 2);
}

function rootFile(plugin: Plugin, name: string) {
  const node = findPluginNodeByPath(plugin, [name]);
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

  const executionPackage = packages.find((item) => item.id === conversation.packageId);
  const plugin = binding.resourceType === "plugin" || binding.pluginId
    ? plugins.find((item) => item.id === (binding.pluginId ?? binding.resourceId)) ?? null
    : null;
  const targetConversation = binding.resourceType === "conversation"
    ? conversations.find((item) => item.id === binding.resourceId) ?? null
    : null;
  const resourcePackageId = plugin?.packageId
    ?? targetConversation?.packageId
    ?? (binding.resourceType === "package" ? binding.resourceId : null);
  const resourcePackage = resourcePackageId
    ? packages.find((item) => item.id === resourcePackageId) ?? null
    : null;
  const selectedNode = plugin && binding.resourceId !== plugin.id
    ? findPluginTreeNode(plugin, binding.resourceId)
    : null;
  const selected = selectedNode?.kind === "file" ? selectedNode : null;
  const resourcePath = selectedNode
    ? `/${selectedNode.path}`
    : plugin ? "/" : "";
  const resourceTitle = selectedNode?.name
    ?? plugin?.name
    ?? targetConversation?.title
    ?? resourcePackage?.name
    ?? binding.resourceId;
  const sections = [
    "# Bound resource context",
    `Conversation kind: ${conversation.kind}`,
    `Execution package: ${executionPackage?.name ?? conversation.packageId} (${conversation.packageId})`,
    `Resource title: ${resourceTitle}`,
    `Resource type: ${binding.resourceType}`,
    `Resource id: ${binding.resourceId}`,
    ...(resourcePath ? [`Resource path: ${resourcePath}`] : []),
    `Resource package: ${
      resourcePackage
        ? `${resourcePackage.name} (${resourcePackage.id})`
        : "global / no owning package"
    }`,
    "Treat the following resource and documentation as authoritative context for this conversation. Inspect the bound resource before proposing changes.",
  ];

  if (plugin) {
    sections.push(
      "## Plugin metadata",
      JSON.stringify(
        {
          id: plugin.id,
          name: plugin.name,
          packageId: plugin.packageId,
          enabled: plugin.enabled,
          local: plugin.id === resourcePackage?.pluginId,
          main: plugin.id === resourcePackage?.mainPluginId,
          shortDescription: plugin.shortDescription,
        },
        null,
        2,
      ),
    );
    if (selected) {
      sections.push(
        `## Current plugin file: ${resourcePath}`,
        textContent(selected),
      );
    }
    const agents = rootFile(plugin, "AGENTS.md");
    if (agents && agents.id !== selected?.id) {
      sections.push("## Plugin AGENTS.md", textContent(agents));
    }
    sections.push("## Plugin system documentation", pluginGuide);
  } else if (targetConversation) {
    const path: ChatMessageContainer[] = [];
    const seen = new Set<string>();
    let current = containers.find(
      (item) => item.id === (
        targetConversation.lastContainerId ?? targetConversation.rootContainerId
      ),
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
          ...targetConversation,
          messages: path.flatMap((container) => {
            const message = container.activeMessage === null
              ? null
              : container.content[container.activeMessage] ?? null;
            return !message || message.type === "error"
              ? []
              : [{ role: container.role, content: normalizeMarkdownLineBreaks(message.content) }];
          }),
        },
        null,
        2,
      ),
    );
    sections.push("## Conversation system documentation", conversationGuide);
  } else {
    sections.push("## Conversation system documentation", conversationGuide);
  }

  return sections.filter(Boolean).join("\n\n");
}
