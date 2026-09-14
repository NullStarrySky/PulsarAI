# 容器 ID 变更通知与 scoped use 监听

已接入实际会话计算：`markContainerDirty(chatId, id, isBranchChange)` 同时标脏和发布 `{ id, isBranchChange }`。`useContainer` 使用容器引用、previousContainer 和 activeNextContainer 的快照推断结构变化，领域动作补齐未取得句柄的创建/连接/删除通知。

`usePathProjection` 的每个调用方独立积累变更：分支集合用于选择最早结构失效位置；版本集合用于替换多个分组。尾节点变化自动寻找旧路径公共前缀。版本变化不使 activePath 失效；普通正文不替换版本/Pulses 未变化的重放组；空版本和缓存 Map 重载有回退。通知渠道是随容器 Map 生命周期回收的 WeakMap，只存最后一个通知 ref，不保存 watcher 或 scope；调用方的同步监听收集每个通知，因此同批多次变化不会覆盖丢失。

dbsync 的 watcher 注册表全部删除。`useChat` scoped 深度监听持久化元数据/草稿，排除 generation 并更新 Plugin 版本引用计数。新增 `usePluginVersion` scoped 监听被寻址的版本，标脏 Plugin 并刷新角色投影，不扫描不可变原始树或所有历史版本。`usePurePluginData` 经它取版本，资源编辑动作仍显式标脏。后台生成保留 detached scope 的容器监听，完成后释放。

最后一次针对性测试：

```powershell
bunx vitest run src/features/Database/test/dbsync-containers.test.ts src/features/Database/test/dbsync-character.test.ts src/features/Plugin/test/use-plugin-data.test.ts
```

3 文件 / 17 测试通过，退出码 0。包括多个消费方、同批分支/版本修改、同尾重连、空版本、只更新对应组、无关正文和单独分支指针不失效、Pulses 引用替换、缓存卸载/重载、Chat runtime 不持久化、引用计数、Plugin 作用域释放、后台生成与级联删除。diff whitespace 检查通过；src 中无 watcher 注册表。

复跑基准：

```powershell
bun scripts/tmp-active-path-watchers-bench.ts --positions
bun scripts/tmp-active-path-watchers-bench.ts --all-containers
```

基准现在执行实际 useContainer/useChat/usePathProjection 和版本/分支动作，而非手工 reason/index 的候选模拟。按 Surface(replay)、Thread(path/intervals)、Composer(draft) 分配读取；轮换两种策略顺序，预热后取 5 次中位数。注册全部句柄的独立运行也通过；单次脏记录断言为版本 1 条，分支 2 条（父容器 + chat），多消费者与参考全量结果一致。

位置矩阵的万条路径、保留 90% 前缀，单位 ms/op：

| 操作 | 全量计算 | ID 增量计算 |
|---|---:|---:|
| 切版本 | 81.66 | 41.72 |
| 切分支 | 131.03 | 63.81 |

全部 11,000 个容器注册句柄的独立复测：切版本约 80.04 → 44.55ms，切分支约 162.59 → 67.79ms；初始化约 0.6–0.8 秒，不计入单次热路径时间。前缀保留较少时增量重建收益较小，甚至可能有额外开销，不能将上述比例推广到所有路径。

Windows / Bun 1.3.14 / Intel i5-1035G1 / 当前安装 Vue。128字符正文、每容器两个版本、空 Pulses。基准使用 dirty Set，不执行真正定时器、数据库 I/O、UI 或有状态 Pulse 重放；Plugin watcher 不在会话 CPU 基准里，由针对性测试验证。机器负载波动明显，绝对耗时和提升比例仅为本机样本。数组发布和索引维护仍有 O(n) 成本，区间与 replayPulses 仍全量派生；这不缓存最终 World 状态。

结果文件：`tmp-path-change-id-positions-results.json`、`tmp-path-change-id-all-results.json`；`tmp-path-change-id-results.json` 是索引维护进一步简化前的普通位置初测。未执行生产打包、完整测试或前端渲染测试。
