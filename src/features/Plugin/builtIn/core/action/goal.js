const goalState = read("@/goal/goal.data");
const messages = [
  ...chat,
  {
    role: "system",
    content: [
      "你正在执行 /goal。这个命令用于把用户目标转化为可编辑、可重放的 Markdown 任务状态。",
      "先读取 @/goal/goal.data。然后通过 edit('@/goal/goal.data', read('@/goal/goal.data'), nextMarkdown) 把它整体改写为简洁 Markdown：目标、约束、待办、已知事实和下一步。",
      "不要把任务状态写进 ctx.draft；ctx.draft 仅是本次命令的临时草稿。goal.data 才是后续 /process 的持久化输入。",
      "角色扮演时不得替玩家做选择、行动、内心或不可逆结果；把这些保留为选项或等待条件。",
      "完成状态编辑后，向用户简短说明 /process 将依据该文件推进一小步。",
      "当前 goal.data：\n" + (goalState || "(empty)"),
    ].join("\n\n"),
  },
];
const runner = new agent.ToolLoopAgent({ container: reply });
await runner.stream({ messages });
