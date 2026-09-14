# Map 模式复测

这是仍保留整集合 watcher 时的记录。监听模式已进一步改为 useContainer 单容器监听，最新结果见 [单容器监听复测](./tmp-active-path-watchers-scoped-report.md)。

生产容器存储已改成 `Map<chatId, Map<containerId, ChatContainer>>`。保留会话加载/卸载边界，增删按 ID 操作；消息、父节点、分支后续链直接 get。持久化容器查询在各已加载会话 Map 中 get，不再遍历所有容器。活动路径复用存储 Map，用 push/reverse 得到正序路径，不重建索引。

容器深度 watcher 保持原有语义：任一容器变化后遍历并标脏整个会话的容器集合。收藏页的遍历也已改为 Map.values()。

复跑：

```powershell
bun scripts/tmp-active-path-watchers-bench.ts --paired
bun scripts/tmp-active-path-watchers-bench.ts --positions
bunx vitest run src/features/Database/test/dbsync-containers.test.ts
```

两个候选策略共用同一份 store Map，排除了额外索引的混杂因素。current 使用实际函数，indexed 在临时基准中加入变更原因注册表、分支前缀和版本分组复用。生产逻辑尚未引入路径变更 Reason。

轮换策略顺序复测，启用实际结构的深度 watcher，保留 90% 分支前缀，单位 ms/op：

| 路径 | 操作 | Map 全量计算 | Map + 路径变更索引 | 全量派生计算 | 索引派生计算 |
|---|---|---:|---:|---:|---:|
| 1,000 | 版本 | 52.25 | 50.21 | 7.88 | 5.33 |
| 1,000 | 分支 | 52.16 | 51.66 | 11.59 | 6.16 |
| 10,000 | 版本 | 523.96 | 454.64 | 78.46 | 41.08 |
| 10,000 | 分支 | 748.46 | 651.08 | 136.14 | 49.44 |

万条路径的分支动作阶段约 0.74ms；旧 Set 模式同一复测方法的动作约 2987ms。两轮机器负载不一致，不能将比值当作精确加速倍数，但它和消除 Array.find 后的复杂度变化一致。

路径变更索引降低了派生计算，本次万条路径总计约降低 13%；千条路径总计只降低约 1–4%。全量 Map 方案的万条路径 watcher 刷新仍约 445ms（版本）/618ms（分支），是主要开销。建议暂缓在生产中维护路径变更索引，优先评估这项深度 watcher 和全量脏标记成本。

环境和限制：Windows / Bun 1.3.14 / Intel i5-1035G1 / 当前安装 Vue。三个组合式实例的读取按 Surface(replay)、Thread(path/intervals)、Composer(draft) 分配；两个消息版本、128字符文本、空 Pulses。包含响应式、分配、动作、computed、dirty 去重和 nextTick；排除 UI、数据库 I/O、真实定时器及有状态 Pulse 重放。绝对计时波动较大，应以阶段成本和数量级为依据。不可变分组数组复制、replayPulses 和区间计算仍包含 O(n) 工作；这里不验证有状态重放的增量正确性。

验证：3 个 focused Vitest 用例通过，覆盖 Map 插入/替换/移除和响应式寻址、编辑持久化、切版本不重算路径、记忆分支尾节点、父链变更/缺失/循环、删除节点后重连及级联记录删除。两种模式的路径/分组参考对照、重复/混合批量变化断言通过。未运行生产打包、完整测试或前端渲染测试。

原始结果：`tmp-active-path-watchers-map-paired-results.json`（轮换顺序），`tmp-active-path-watchers-map-results.json`（100/1,000/10,000，watcher 开关，以及保留 10%/50%/90% 的分支）。旧 Set 结果文件仍保留，便于对照。
