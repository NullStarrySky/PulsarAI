# 激活路径临时基准

这是修改 Map 存储之前的 Set 模式记录。临时脚本现已更新为 Map 模式，最新结论见 [Map 模式复测](./tmp-active-path-watchers-map-report.md)。

结论：当前实现还有直接查找和深度 watcher 的成本，路径变更索引目前不是优先优化项。这次测量不能代表已经采用 `Map<containerId, container>` 后的实现。

运行：

```powershell
bun scripts/tmp-active-path-watchers-bench.ts --paired
```

默认运行覆盖 100 / 1,000 / 10,000 条激活路径，分别开启和关闭持久化 watcher。`--paired` 针对千条和万条路径，启用 watcher，轮换策略顺序复测；每种策略预热后取 5 次的中位数。可另加 `--positions` 测试默认矩阵之外更靠前的分支切换，这项很慢，本次没有完成它。

还原内容：实际 `currentMessage`、`pathForTail`、版本/分支组合式函数的源码；实际 Vue reactive/shallowReactive/computed/watch/nextTick；`Map<chatId, Set<ChatContainer>>` 和嵌套 chatMeta Map；元数据和容器 watcher 注册表、dirty Set、调度锁；实际区间计算。三个组合式实例按当前调用方懒求值：Surface 读取 replayPulses，Thread 读取路径/区间，Composer 读取草稿。

每个容器有两个版本，128 字符文本，空 parts/steps/Pulses。分支保留前 90%，两侧路径等长；版本切换发生在公共前缀末端。计时包含分配、响应式代理、动作和 nextTick 刷新；不包含 UI、数据库 I/O、真实 500ms 定时器和有状态 Pulse 重放。dirty 队列保持现有去重与调度锁行为，元数据 watcher 的 Plugin 引用计数回调未模拟。

三种策略：

- current：现有路径与分组实现。
- reverse：仅将路径的 unshift 改成 push/reverse，仍临时重建 Map。
- indexed：Reason 注册表记录变化，合并同批变化；分支复用前缀，版本仅替换对应分组；不可变数组发布，继续全量计算 replayPulses 和区间。额外使用预建 containerId Map，未计其维护成本，属于乐观的候选实现。

轮换执行顺序复测结果，单位 ms/op：

| 路径 | 操作 | 策略 | 动作 | 派生计算 | watcher 刷新 | 总计 |
|---|---|---|---:|---:|---:|---:|
| 1,000 | 版本 | current | 0.14 | 13.52 | 98.42 | 113.61 |
| 1,000 | 版本 | indexed | 0.16 | 8.30 | 85.79 | 95.34 |
| 1,000 | 分支 | current | 46.37 | 30.73 | 125.21 | 215.44 |
| 1,000 | 分支 | indexed | 50.08 | 10.37 | 105.73 | 180.59 |
| 10,000 | 版本 | current | 0.08 | 92.24 | 493.09 | 585.61 |
| 10,000 | 版本 | indexed | 0.17 | 60.22 | 494.63 | 555.03 |
| 10,000 | 分支 | current | 2986.92 | 265.43 | 692.55 | 3891.48 |
| 10,000 | 分支 | indexed | 2903.38 | 61.58 | 609.34 | 3612.35 |

各列分别取中位数，因此阶段中位数之和不一定等于总计。Bun 1.3.14，Windows，Intel i5-1035G1，使用当前安装的 Vue；顺序测试和复测的绝对计时波动明显，不能将这里的百分比作为稳定提升或 Electron 响应延迟。

代码事实与判断：

1. dbsync 内层是 Set；分支 goto 沿后续链使用 `all.find`。长后缀的动作成本为 O(集合大小 × 后缀长度)，不只是万次 O(1) 查找。
2. pathForTail 每次重建 Map，还用 unshift 建路径；版本变化不触发 activePath 重算，只触发版本相关派生计算。
3. 深度 watcher 遍历整个会话容器树，回调再将所有容器标脏。索引复用不减少这项成本，本次万条路径切版本总计仅降低约 5%，派生计算降低约 35%。
4. indexed 的单版本更新仍复制数组，replayPulses 仍 map，区间仍全量计算，不是整个更新 O(1)。实际有状态资源重放也不能只改一个最终状态元素：较早 Pulse 改变会影响后续重放，需要前缀状态检查点或其他有效的重放缓存。

建议先确认并实现预期的 containerId 直接索引，再评估持久化 watcher 是否需要遍历所有容器。完成这些后，再用基准判断是否值得引入 Reason 的维护与失效逻辑。本次没有修改生产代码。

分组/路径与完整参考结果一致、切版本不重算路径、同批重复变化、版本与分支混合变化的断言已通过；轮换复测退出码 0。原始结果在同目录 `tmp-active-path-watchers-results.json`、`tmp-active-path-watchers-paired-results.json`。
