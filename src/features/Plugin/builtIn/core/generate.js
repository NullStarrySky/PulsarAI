export default async function run() {
	const config = await imports("@/config.json");
	const useStreamText = Boolean(config.useStreamText?.value);
	const messages = (await Promise.all(slot.paths("CTX_BUILD").map((path) => imports(path)()))).flat();

	if (useStreamText) {
		await agent.streamText({ container: reply, messages });
	} else {
		const runner = new agent.ToolLoopAgent({ container: reply });
		await runner.stream({ messages });
	}

	// 流结束后可直接读取和覆盖完整正文，执行正则或其它后处理。
	// reply.content = process(reply.content);

}
