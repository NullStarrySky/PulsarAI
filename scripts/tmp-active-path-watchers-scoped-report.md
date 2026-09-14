# useContainer 单容器监听复测

这是尚未接入生产路径索引、尚未迁移其他实体 watcher 时的记录。脚本现已更新为实际 ID 通知模式，最新结果见 [容器 ID 变更与 scoped use 监听](./tmp-path-change-id-report.md)。

dbsync 的整会话容器 Map 深度 watcher 及其注册表已经移除。`useContainer(chatId, containerId)` 返回一个响应式容器句柄，并在调用方作用域内监听该容器，发生嵌套变化时只标记该 ID dirty。`useContainerComposable` 通过它取得容器。

监听使用 deep + flush:sync，确保编辑发生后立即标脏，不会因调用方随即卸载而丢失排队回调；同步监听处理包含在基准的 action 阶段，不能只看 flush 列。容器变为 null 时不标脏，避免把缓存卸载误判为持久化删除。现有创建、连接、版本、删除等领域动作继续保留显式 markDirty。

后台生成单独创建 detached effectScope，持有生成目标的 useContainer 句柄，在 finally 中释放，因此不依赖消息组件是否挂载。作用域释放之后直接修改未被其他句柄监听的容器不会自动同步：外部修改应通过 useContainer 或已有显式标脏的领域动作。

复跑命令：

```powershell
bun scripts/tmp-active-path-watchers-bench.ts --paired
bun scripts/tmp-active-path-watchers-bench.ts --paired --all-containers
bun scripts/tmp-active-path-watchers-bench.ts --positions
bunx vitest run src/features/Database/test/dbsync-containers.test.ts
```

临时基准提取实际 useContainer 源码，使用真实 Vue watcher 和 effectScope，注册表记录 stop handle。默认注册两条分支末端各 40 个句柄和变更目标，共 81 个；全部注册模式对万条激活路径和千条备选后缀注册 11,000 个句柄。两种策略共享 store Map，index 策略仍仅存在于临时测试中。

轮换策略执行顺序，5 次中位数，启用 useContainer 监听，单位 ms/op：

| 路径 | 操作 | 全量计算 | 路径变更索引 |
|---|---|---:|---:|
| 1,000 | 版本 | 4.83 | 2.77 |
| 1,000 | 分支 | 10.39 | 4.20 |
| 10,000 | 版本 | 55.90 | 30.94 |
| 10,000 | 分支 | 79.98 | 31.91 |

旧 Map + 整集合 watcher 的万条路径全量计算为切版本 523.96ms、切分支 748.46ms。这两次运行机器负载不同，不应将比值当作精确提升倍数；但动作与刷新成本已从全量深度遍历降低到单容器处理。新模式万条路径切版本 action 约 0.15ms，切分支 action 约 0.64ms，meta watcher 的排队刷新约 0.13ms。主要成本转移为全量派生计算。

全部容器都注册句柄的独立复测：万条路径全量切版本约 80.40ms、切分支约 163.50ms；index 策略约 47.99ms、66.97ms。注册全部句柄有初始深度依赖收集和内存成本，初始化不包含在 ms/op 热路径计时里。该轮的单次动作仍约 0.17ms（版本）/1.08ms（分支），并未回到全会话深度遍历。

分支位置矩阵也已完成：保留 10% 前缀时全量/index 约 179.66/139.17ms，保留 50% 时约 171.54/92.26ms，顺序批次计时存在负载波动。复用前缀越少，索引节省的派生工作越少。

验证：6 个针对性测试通过，覆盖 Map 响应式插入/替换/移除、只同步访问过的容器、卸载前编辑不丢失、作用域释放后停止监听、缓存卸载不删除数据库记录、后台生成持久化与释放、版本和分支路径、节点重连与级联删除。基准断言验证单次版本变化只标脏一个容器、分支只标脏父容器和会话元数据；路径/分组参考对照及批量重复/混合变化通过。所有完整执行的复测退出码 0。

限制：Windows/Bun 1.3.14/Intel i5-1035G1/当前安装 Vue；两个消息版本、128字符文本、空 Pulses。没有 UI、数据库 I/O、真实定时器或有状态 Pulse 重放。同步 watcher 重遍历的是单个容器，容器内容很大时仍有自身开销。未运行生产打包、完整测试或前端渲染测试。

原始结果在同目录 `tmp-active-path-watchers-scoped-paired-results.json`、`tmp-active-path-watchers-scoped-all-paired-results.json`、`tmp-active-path-watchers-scoped-results.json`；旧 Map 和 Set 结果文件保留供对照。
