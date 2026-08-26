# SillyTavern 迁移事实与排错手册

本文记录当前导入器实际支持的数据格式、关系来源、目标资源和失败诊断。事实优先级为 TauriTavern Rust domain/repository 与契约测试、最新 SillyTavern 前端字段消费、真实 `data/default-user` 样本；旧的手写类型只用于发现待核对字段。

## 1. 数据目录

导入器接受 SillyTavern 根目录、`data/`、`data/default-user/` 或单个文件。Reader 递归列出普通文件但不跟随符号链接。`backups`、`thumbnails`、`cache`、`.git` 和 `node_modules` 会出现在诊断中，但不参与资源转换。

常见目录：

| 来源 | 类型 | 目标 |
| --- | --- | --- |
| `characters/*.png` | PNG `tEXt` 中的 `chara`/`ccv3` Base64 JSON | CharacterPackage + 本地 Plugin |
| `characters/*.json` | V1/V2/V3 角色 JSON | CharacterPackage + 本地 Plugin |
| `chats/<角色目录>/*.jsonl` | header + 每行一条消息 | Conversation + message-version 分支 |
| `worlds/*.json` | 世界书，`entries` 可为对象或数组 | 已认领时复制到角色本地 Plugin，否则独立全局 Plugin |
| `User Avatars/*` 与 `power_user.personas` | 用户角色头像、名称和描述 | 使用该 persona 的角色包本地 `character/user/*.md` |
| `OpenAI Settings/*.json` | Chat Completion 上下文、深度提示和采样配置 | 内置 Plugin `entry/<preset>/` |
| `backgrounds/*` | 图片或视频 | 内置 Plugin `background/` 媒体节点 |
| `settings.json` | 全局设置聚合 | persona、世界书关系和可支持连接的来源 |
| `themes/*.json` | 酒馆主题 | 不迁移，保留诊断 |

## 2. 角色卡

角色卡优先读取 `data`，没有 `data` 时读取顶层兼容字段。支持的核心字段：

- `name` -> 角色包 `name`；
- 原文件名去扩展名 -> 角色包 `nickname`；
- PNG 原图 -> 角色包 `icon`；
- `description/personality/scenario/system_prompt/post_history_instructions/mes_example/creator_notes/tags/creator` -> `character/main.md` 的分节内容；
- `first_mes` 和 `alternate_greetings` -> 角色包模板会话的一条 assistant 消息及其版本；
- `data.character_book` -> `lorebooks/embedded/`，默认没有 insertion；
- `data.extensions.regex_scripts` -> 本地根 `regex.json`；
- `data.extensions.world` 等名称字段 -> 独立世界书认领候选。

未消费字段不会删除或伪造含义，其字段名写入导入报告。

## 3. 会话

JSONL 第一行必须是对象 header，后续每个非空行必须是消息对象。`is_system` 优先映射 system，随后 `is_user` 映射 user，其余映射 assistant。`mes`、`swipes` 和 `swipe_id` 转成同一 `ChatMessageContainer` 内的多个具体 `ChatMessage` 版本和 `activeMessage`。

会话通过 header `character_name` 与角色包 `name`/`nickname` 规范化匹配。目录名只在 header 缺失时使用。零候选产生 `chat-character-missing`，多候选产生 `chat-character-ambiguous`；两者都会阻止提交。

## 4. 世界书

条目读取 `uid/id`、`comment/name`、`content`、`disable/enabled`、`constant`、`key`、`keysecondary`、`selectiveLogic`、`scanDepth`、`probability`、`useProbability`、`position`、`depth` 和 `order`。

- `position = 4` -> `depth:0` 至 `depth:6`；
- `position = 0/1` -> `context`；
- AN/EM/outlet 等没有直接对应容器的位置近似为 `context` 并报告诊断；
- `constant` 条目不需要关键词条件；
- 主关键词转换为 `include(keyword, scanDepth)` 的 OR；
- 条目未声明 `scanDepth`、`caseSensitive` 或 `matchWholeWords` 时，物化 `settings.json/world_info_settings` 的全局默认值；大小写或整词语义通过关键词正则保留；
- 次关键词按 AND_ANY、NOT_ALL、NOT_ANY、AND_ALL 转为显式布尔表达式；
- 概率转换为 `probability(percentage)`；
- 嵌入世界书无论原开关如何都默认关闭；
- 角色明确绑定的独立世界书保留原条目开关；
- 未认领世界书成为独立全局 Plugin；`world_info_settings.world_info.globalSelect` 中的次要世界书会加入适用角色包的启用集合。若同一本书也是某个角色的主要世界书，该角色只使用本地副本，避免重复注入。

同名世界书不会按“最后一个覆盖前一个”处理。无法唯一认领时应在预览中人工修正来源数据或后续增加显式映射界面。

## 5. 预设与正则

只有 `OpenAI Settings` 下的 Chat Completion 预设参与迁移。`KoboldAI Settings`、`TextGen Settings`、`NovelAI Settings`、`context`、`instruct`、`sysprompt` 和 `reasoning` 都属于文本补全链路，Reader 直接忽略，不进入资源列表、转换结果或计数。

OpenAI prompt 中 `injection_position != 1` 的启用正文按角色写入 `*.chat.json`。`injection_position = 1` 的绝对深度提示不混入消息数组，而是在同一入口目录拆成 `depth-<depth>-<index>-<name>.md`；文件保留 `injection_order`，并记录 `depth:0` 至 `depth:6` 的 insertion。因为导入预设尚未被用户选择，condition 固定为 `false`，避免多个预设同时注入；原启用状态和完整字段仍保存在 `configuration.json`，后续入口选择逻辑负责激活对应文件。

预设资源写入内置 Plugin 的 `entry/<name>/`：

- `<name>.chat.json`；
- `depth-<depth>-<index>-<name>.md`（仅绝对深度提示）；
- `<name>.regex.json`；
- `configuration.json`。

这些文件是明确的入口资源，不新增系统级“主上下文入口”。具体选择和执行由 Plugin 生成流程或后续入口选择配置决定。

角色卡正则、`extension_settings.regex` 系统正则和独立正则资源的 USER_INPUT/AI_OUTPUT、深度、prompt/display 范围映射到每个角色本地 Plugin 的根 `regex.json`。斜杠命令、WORLD_INFO、REASONING 等专用触发时机只报告，不猜测执行位置。

## 6. 用户角色、背景和连接

`power_user.personas` 提供头像文件到展示名映射，`persona_descriptions` 提供描述。只有被已认领会话 `user_name` 使用的 persona 才复制到对应角色包；未认领 persona 保留 warning。

背景以媒体 data URL 写入内置 Plugin 的 `background` 容器，不依赖酒馆原路径继续存在。背景的可用资源与选择状态由 `background` 插槽自身管理，不再额外写入 Plugin 配置项。

当前只把 `oai_settings.custom_url/reverse_proxy` 转为自定义 ModelConnection，并导入明确的 model ID。`secrets.json` 不会自动复制，也不会出现在日志或报告中；用户必须在模型设置中确认密钥。

## 7. 两阶段提交与恢复

`preview()` 只扫描、判别、转换和放置。`commit(planId)` 只接受最后一次仍有效的预览。任何 error 级解析诊断、关系冲突或已有 package/plugin/provider ID 都会阻止覆盖。提交失败时，Importer 尝试按反序删除本次新建的 provider、全局 Plugin 和 CharacterPackage，并恢复本次修改前的内置 Plugin 快照。数据库和媒体写入目前不具备跨仓储原子事务，因此恢复失败会保留原始异常供人工排查。

## 8. 宏与 EJS 边界

文本字段中的非嵌套简单宏和同步 ST-Prompt-Template EJS 由公共导入期转换器改写成现有 `{{ JavaScript }}`。`char` 在运行时通过 Conversation 只读 API 查找当前角色包的来源 `nickname`；简单局部/全局变量使用带命名空间的 `localStorage`。Sandbox 和生成流程不新增酒馆宏引擎、EJS runtime、API mock 或通用事件总线。

`if/else`、作用域、标志、变量简写、嵌套宏、异步 EJS、include、酒馆 API、DOM/UI 和扩展事件调用会被置换为返回空字符串的 JavaScript 注释，并产生带文件/字段来源的 warning。独立 Quick Reply、STScript 和扩展脚本资源仍不执行。完整清单见 [`模板转换.md`](./模板转换.md)。

## 9. 常见诊断

- `source.parse-failed`：检查 UTF-8、JSON/JSONL 行和 PNG `chara`/`ccv3` 块。
- `discriminator.ambiguous`：文件路径提示与 JSON 形状冲突，检查是否放错目录。
- `chat-character-missing`：核对 header `character_name`、角色卡 `name` 和文件名。
- `character-name-duplicate`：多个角色卡同名，先改名或等待显式对应界面。
- `worldbook.position-approximated`：原位置没有 PulsarAI 容器语义，检查导入报告后手工选择容器。
- `regex.unsupported-placement`：原正则依赖当前未支持的专用酒馆事件。
- `provider.secret-not-copied`：地址已导入，密钥仍需人工确认。
- `macro.unsupported`：复杂宏已注释；查看字段路径和 `模板转换.md`。
- `ejs.unsupported`：EJS 依赖异步、include、酒馆 API、UI/事件或结束符冲突，动态标签已注释。
- `macro-resource.unsupported`：这是独立脚本资源，不属于文本内简单宏转换。
