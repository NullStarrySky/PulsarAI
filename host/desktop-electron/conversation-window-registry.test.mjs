import assert from "node:assert/strict";
import { test } from "node:test";
import {
	claimConversation,
	releaseConversations,
} from "./conversation-window-registry.mjs";

test("one conversation has one owning window through switches and closes", () => {
	const owners = new Map();
	const first = { isDestroyed: () => false };
	const second = { isDestroyed: () => false };
	assert.equal(claimConversation(owners, first, "a"), null);
	assert.equal(claimConversation(owners, second, "a"), first);
	assert.equal(claimConversation(owners, first, "b"), null);
	assert.equal(claimConversation(owners, second, "a"), first);
	owners.delete("a");
	assert.equal(claimConversation(owners, second, "a"), null);
	releaseConversations(owners, second);
	assert.equal(claimConversation(owners, first, "a"), null);
});
