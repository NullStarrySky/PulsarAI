import { describe, expect, it } from "vitest";
import type {
  ChatMessageContainer,
  ConversationResourceOperationStats,
  ConversationResourceUpdate,
} from "./conversation-types";
import { ConversationResourceOverlay } from "./conversation-resource-overlay";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

const stats = (): ConversationResourceOperationStats => ({
  total: 0, edit: 0, create: 0, move: 0, remove: 0,
  codeAct: { attempted: 0, committed: 0, rolledBack: 0 },
  logCount: 0,
});

function plugin(): Plugin {
  return {
    id: "test-plugin", packageId: "package", name: "测试", icon: "", shortDescription: "", enabled: true, builtIn: false,
    nodes: [{ id: "note", path: "note.md", name: "note.md", icon: "", treeOrder: 0, kind: "file", content: "base", order: 100 }],
  };
}

function pathWith(update?: ConversationResourceUpdate): ChatMessageContainer[] {
  return [{
    id: "assistant", role: "assistant", conversationid: "chat", activeMessage: 0,
    availableNextContainer: [], activeNextContainer: null, previousContainer: null,
    content: [{ id: "message", type: "message", content: "", createdAt: "2026-01-01T00:00:00.000Z", meta: { steps: [], ...(update ? { resourceUpdate: update } : {}) } }],
  }];
}

describe("ConversationResourceOverlay", () => {
  it("replays only the active message version without changing the base Plugin", () => {
    const base = plugin();
    const overlay = new ConversationResourceOverlay({
      plugins: [base],
      activePath: pathWith({
        createdAt: "2026-01-01T00:00:00.000Z", stats: stats(),
        operations: [{ type: "edit", target: { kind: "plugin-node", pluginId: "test-plugin", resourceId: "note" }, value: { id: "note", path: "note.md", name: "note.md", icon: "", treeOrder: 0, kind: "file", content: "branch", order: 100 } }],
      }),
    });

    expect(overlay.plugins[0]?.nodes[0]).toMatchObject({ content: "branch" });
    expect(base.nodes[0]).toMatchObject({ content: "base" });
  });

  it("rolls a failed CodeAct back while retaining its final message statistics", async () => {
    const updates: ConversationResourceUpdate[] = [];
    const overlay = new ConversationResourceOverlay({
      plugins: [plugin()], activePath: [], onUpdate: (update) => { updates.push(update); },
    });

    await overlay.begin();
    await overlay.writeFile("test-plugin", "note.md", "temporary");
    await overlay.writeFile("test-plugin", "created.md", "temporary");
    await overlay.rollback();

    expect(overlay.plugins[0]?.nodes).toHaveLength(1);
    expect(overlay.plugins[0]?.nodes[0]).toMatchObject({ content: "base" });
    expect(updates[updates.length - 1]).toMatchObject({
      operations: [],
      stats: { total: 0, codeAct: { attempted: 1, committed: 0, rolledBack: 1 } },
    });

    await overlay.begin();
    await overlay.writeFile("test-plugin", "note.md", "committed");
    await overlay.commit();

    expect(overlay.plugins[0]?.nodes[0]).toMatchObject({ content: "committed" });
    expect(updates[updates.length - 1]).toMatchObject({
      operations: [expect.objectContaining({ type: "edit" })],
      stats: { total: 1, edit: 1, codeAct: { attempted: 2, committed: 1, rolledBack: 1 } },
    });
  });

  it("records a file-editor save as a replayable Overlay edit", () => {
    const initial = new ConversationResourceOverlay({ plugins: [plugin()], activePath: [] });
    initial.updateFile("test-plugin", "note", { content: "edited in chat", order: 42, insertion: { slot: "context" } });
    const update = initial.resourceUpdate();

    const replayed = new ConversationResourceOverlay({ plugins: [plugin()], activePath: pathWith(update) });
    expect(replayed.plugins[0]?.nodes[0]).toMatchObject({
      content: "edited in chat",
      order: 42,
      insertion: { slot: "context" },
    });
    expect(update.operations).toHaveLength(1);
    expect(update.stats).toMatchObject({ total: 1, edit: 1 });
  });
});
