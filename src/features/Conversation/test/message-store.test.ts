import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.hoisted(() => {
  Object.assign(globalThis, {
    window: { pulsarHost: { invoke: async () => null, listen: async () => () => {} } },
  });
});

import { modelMessagesFromPath, useMessageStore } from "../messages/message-store";

describe("Conversation message store", () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it("keeps a persisted resource edit in the causal path but out of model context", async () => {
    const messages = useMessageStore();
    messages.persist = vi.fn().mockResolvedValue(undefined);
    const root = {
      id: "root", role: "system" as const, conversationid: "chat", activeMessage: 0,
      availableNextContainer: [], activeNextContainer: null, previousContainer: null,
      content: [{ id: "root-message", type: "message" as const, content: "base", createdAt: "2026-08-22T00:00:00.000Z", meta: { steps: [] } }],
    };
    messages.containers = [root];

    const edit = await messages.appendHiddenResourceUpdate({
      conversationId: "chat",
      previousContainer: root.id,
      resourceUpdate: {
        createdAt: "2026-08-22T00:00:00.000Z",
        operations: [],
        stats: { total: 0, edit: 0, create: 0, move: 0, remove: 0, codeAct: { attempted: 0, committed: 0, rolledBack: 0 }, logCount: 0 },
      },
    });

    expect(edit.hidden).toBe(true);
    expect(edit.previousContainer).toBe(root.id);
    expect(root.activeNextContainer).toBe(edit.id);
    expect(messages.pathFor(edit.id)).toEqual([root, edit]);
    expect(modelMessagesFromPath(messages.pathFor(edit.id))).toEqual([{ role: "system", content: "base" }]);
  });

  it("clears translation metadata when a message is manually edited", async () => {
    const messages = useMessageStore();
    messages.persist = vi.fn().mockResolvedValue(undefined);
    const container = {
      id: "message-container", role: "assistant" as const, conversationid: "chat", activeMessage: 0,
      availableNextContainer: [], activeNextContainer: null, previousContainer: null,
      content: [{
        id: "message", type: "message" as const, content: "译文", createdAt: "2026-08-22T00:00:00.000Z",
        meta: { steps: [], translation: { originalContent: "original", translatedAt: "2026-08-22T00:00:00.000Z" } },
      }],
    };
    messages.containers = [container];

    await messages.setMessageContent(container.id, "手动编辑");

    expect(container.content[0]?.content).toBe("手动编辑");
    expect(container.content[0]?.meta.translation).toBeUndefined();
  });
});
