async () => {
	async function messagesForSlot(id) {
		const values = await Promise.all(
			slot.paths(id, "global").map((path) => parse(path)),
		);
		return values.flatMap((value) =>
			Array.isArray(value)
				? value
				: typeof value === "string" && value.trim()
					? [{ role: "system", content: value }]
					: [],
		);
	}

	let messages = [];
	for (const id of [
		"before_char",
		"character",
		"after_char",
		"user",
		"document",
		"data_prompt",
		"toolFunction",
		"chat",
	])
		messages.push(...(await messagesForSlot(id)));

	for (let depth = 6; depth >= 0; depth -= 1) {
		const injected = await messagesForSlot(`depth:${depth}`);
		messages.splice(Math.max(0, messages.length - depth), 0, ...injected);
	}

	for (const path of slot.paths("CTX_PROCESS_BEFORE_REGEX", "global")) {
		const next = await imports(path, { messages });
		if (Array.isArray(next)) messages = next;
	}

	const rules = (
		await Promise.all(
			slot.paths("REGEX", "global").map((path) => imports(path)),
		)
	)
		.flat()
		.filter((rule) => rule && rule.applyOnRendering !== true);

	messages = messages.map((message, index) => {
		if (!message || typeof message.content !== "string") return message;
		const depth = messages.length - index;
		let content = message.content;
		for (const rule of rules) {
			const rangeMatches =
				rule.range === "all" ||
				(rule.range === "user_input" && message.role === "user") ||
				(rule.range === "ai_output" && message.role === "assistant");
			const minimum =
				rule.depth_min === "INF" ? Infinity : Number(rule.depth_min);
			const maximum =
				rule.depth_max === "INF" ? Infinity : Number(rule.depth_max);
			if (!rangeMatches || depth < minimum || depth > maximum) continue;
			try {
				content = content.replace(
					new RegExp(rule.find_regex, "g"),
					rule.replace_regex,
				);
			} catch {}
		}
		return { ...message, content };
	});

	return messages;
};
