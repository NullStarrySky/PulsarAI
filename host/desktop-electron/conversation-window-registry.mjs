export function claimConversation(owners, window, id) {
	const existing = owners.get(id);
	if (existing && existing !== window && !existing.isDestroyed())
		return existing;
	owners.set(id, window);
	return null;
}

export function releaseConversations(owners, window) {
	for (const [conversationId, owner] of owners)
		if (owner === window) owners.delete(conversationId);
}
