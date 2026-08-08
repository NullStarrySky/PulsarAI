# Database

`application/database-service.ts` 通过 Tauri `database_select_all`、`database_select_one`、`database_upsert`、`database_delete` 和 `database_reset_character_data` 访问 SurrealDB。Plugin 的元信息、稳定节点和搜索继续使用专用的 `database_load_plugins`、`database_save_plugin`、`database_delete_plugin` 与 `database_search_plugin_nodes` 命令。

所有前端数据库边界都通过 `application/database-log.ts` 记录 `[Pulsar DB]` 日志。日志以 200ms 批次输出，包含操作序号、操作名、表名、记录 ID、结果数量、成功状态和耗时；查询内容只记录长度，不打印记录正文或搜索文本。日志批处理只影响控制台输出，不延迟或合并真实数据库调用。

通用 `database_upsert` 使用调用方提供的资源 ID 构造确定性的 SurrealDB record ID，并在同一显式事务内清理相同 `resource_key` 的旧随机记录后执行 `UPSERT`。这保证同一资源的并发写入不会通过 `DELETE + CREATE` 竞态制造重复行。

ModelConnection Store 使用共享的 in-flight Promise 串行化首次初始化。读取 provider 时不再无条件全量写回；如果检测到历史重复 `resource_key`，只按唯一 provider ID 顺序写入一次，借助事务 upsert 压缩重复记录。

数据库打开时不再清理插件表或创建 BM25 索引。旧版本曾在第一次任意查询的 `app_db()` 初始化期间执行插件孤儿清理并定义 `plugin_node_search`，导致普通读取触发全表索引构建。当前打开流程会移除遗留的该索引和 analyzer；插件搜索改用大小写无关 `CONTAINS`，避免后台索引维护持续影响窗口线程。

之前的 localStorage Mock 已停用并从代码中移除。遗留的 `pulsarai:mock-database:v1` localStorage 快照不会被读取、迁移或写回 SurrealDB。
