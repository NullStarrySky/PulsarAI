# Database

`database-service.ts` 通过 Tauri `database_select_all`、`database_select_one`、`database_upsert`、`database_delete` 和 `database_reset_character_data` 访问 SurrealDB。Plugin 的元信息、稳定节点和搜索继续使用专用的 `database_load_plugins`、`database_save_plugin`、`database_delete_plugin` 与 `database_search_plugin_nodes` 命令。

通用 `database_upsert` 使用 SurrealDB 2.6 的 `type::thing(table, id)` 以调用方资源 ID 构造确定性的 record ID，并直接执行单条 `UPSERT`。不能在 2.6 中按新版参数顺序调用 `type::record(table, id)`；该版本的同名函数参数顺序不同，会把资源 ID 误作表名。通用写入和删除都会检查 SurrealDB response 内的逐语句错误，避免命令表面成功、实际没有落盘，进而导致角色包和会话在刷新后消失。

ModelConnection Store 使用共享的 in-flight Promise 串行化首次初始化。读取 provider 时不再无条件全量写回；如果检测到历史重复 `resource_key`，只按唯一 provider ID 顺序写入一次，借助事务 upsert 压缩重复记录。

数据库打开时不再清理插件表或创建 BM25 索引。旧版本曾在第一次任意查询的 `app_db()` 初始化期间执行插件孤儿清理并定义 `plugin_node_search`，导致普通读取触发全表索引构建。当前打开流程会移除遗留的该索引和 analyzer；插件搜索改用大小写无关 `CONTAINS`，避免后台索引维护持续影响窗口线程。

之前的 localStorage Mock 已停用并从代码中移除。遗留的 `pulsarai:mock-database:v1` localStorage 快照不会被读取、迁移或写回 SurrealDB。
