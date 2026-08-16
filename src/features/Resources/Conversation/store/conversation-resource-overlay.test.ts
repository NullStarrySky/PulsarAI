import { describe, expect, test } from "vitest";
import type { ChatMessageContainer } from "@/features/Resources/Conversation/messages/conversation-types";
import type { Plugin } from "@/features/Resources/Plugin/tree/plugin-types";
import {
  applyConversationResourceOperation,
  createConversationResourceOverlay,
} from "@/features/Resources/Conversation/store/conversation-resource-overlay";

function pluginFixture(): Plugin {
  return {
    id: "plugin-a",
    packageId: null,
    name: "Plugin A",
    icon: "box",
    shortDescription: "",
    enabled: true,
    builtIn: false,
    root: {
      id: "root-a",
      name: "Plugin A",
      icon: "folder",
      treeOrder: 0,
      kind: "folder",
      children: [{
        id: "file-a",
        name: "state.json",
        icon: "file",
        treeOrder: 0,
        kind: "file",
        content: "base",
        order: 100,
      }],
    },
  };
}

function pathFixture(): ChatMessageContainer[] {
  return [{
    id: "container-a",
    role: "assistant",
    conversationid: "conversation-a",
    content: [
      {
        id: "inactive",
        type: "message",
        content: "",
        createdAt: "2026-08-13T00:00:00.000Z",
        meta: {
          steps: [],
          resourceUpdate: {
            createdAt: "2026-08-13T00:00:00.000Z",
            operations: [{
              type: "edit",
              target: { kind: "plugin-node", pluginId: "plugin-a", resourceId: "file-a" },
              value: {
                id: "file-a",
                name: "state.json",
                icon: "file",
                treeOrder: 0,
                kind: "file",
                content: "inactive",
                order: 100,
              },
            }],
          },
        },
      },
      {
        id: "active",
        type: "message",
        content: "",
        createdAt: "2026-08-13T00:00:01.000Z",
        meta: {
          steps: [],
          resourceUpdate: {
            createdAt: "2026-08-13T00:00:01.000Z",
            operations: [
              {
                type: "edit",
                target: { kind: "plugin-node", pluginId: "plugin-a", resourceId: "file-a" },
                value: {
                  id: "file-a",
                  name: "state.json",
                  icon: "file",
                  treeOrder: 0,
                  kind: "file",
                  content: "active",
                  order: 100,
                },
              },
              {
                type: "edit",
                target: {
                  kind: "data",
                  pluginId: "plugin-a",
                  resourceId: "data-instance-a",
                  dataId: "data-a",
                  path: "/state.data.json",
                },
                value: { count: 2 },
              },
            ],
          },
        },
      },
    ],
    activeMessage: 1,
    availableNextContainer: [],
    activeNextContainer: null,
    previousContainer: null,
  }];
}

describe("Conversation resource overlay", () => {
  test("replays only active message versions without mutating base plugins", () => {
    const plugins = [pluginFixture()];
    const overlay = createConversationResourceOverlay(plugins, pathFixture());

    expect(overlay.plugins[0]!.root.children[0]).toMatchObject({ content: "active" });
    expect(overlay.dataValues["data-instance-a"]).toEqual({ count: 2 });
    expect(plugins[0]!.root.children[0]).toMatchObject({ content: "base" });
  });

  test("applies create, move, and remove in order", () => {
    const overlay = createConversationResourceOverlay([pluginFixture()], []);
    applyConversationResourceOperation(overlay, {
      type: "create",
      pluginId: "plugin-a",
      parentId: "root-a",
      node: {
        id: "folder-a",
        name: "folder",
        icon: "folder",
        treeOrder: 1,
        kind: "folder",
        children: [],
      },
    });
    applyConversationResourceOperation(overlay, {
      type: "move",
      pluginId: "plugin-a",
      resourceId: "file-a",
      targetPluginId: "plugin-a",
      parentId: "folder-a",
      name: "moved.json",
    });
    applyConversationResourceOperation(overlay, {
      type: "remove",
      target: { kind: "plugin-node", pluginId: "plugin-a", resourceId: "file-a" },
    });

    expect(overlay.plugins[0]!.root.children).toHaveLength(1);
    expect(overlay.plugins[0]!.root.children[0]).toMatchObject({
      id: "folder-a",
      children: [],
    });
  });
});
