const goalState = read("@/goal/goal.data");
if (!String(goalState || "").trim()) {
  await reply.setContent("当前没有可执行的 goal。先使用 /goal 设置目标和待办。");
} else {
  const context = await imports(slot.paths("CTX_BUILD", "global"));
  const messages = [
    ...context,
    {
      role: "system",
      content: [
        "依据下面的 goal.data 执行一个最小、可见、可回应的下一步。",
        "完成后用 edit 更新完成项、事实和下一步；保持 Markdown 清晰。",
        "不得替玩家做选择、行动、内心或不可逆结果。若下一步需要玩家决定，给出场景状态或选项并在 goal.data 标明等待。",
        "goal.data：\n" + goalState,
      ].join("\n\n"),
    },
  ];
  const runner = new agent.ToolLoopAgent({ container: reply });
  await runner.stream({ messages });
}
