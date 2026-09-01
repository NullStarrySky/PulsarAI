---
title: 项目思路
description: 面向开发者与贡献者的 PulsarAI 心智模型和设计判断方法
---

# 项目思路

这是一份给人类阅读的项目说明。它不从目录逐项介绍功能，而是解释 PulsarAI 为什么长成现在这样，以及新增代码时应该沿着哪条思路继续。

## PulsarAI 解决的不是“怎么再加一个聊天功能”

普通聊天前端的功能通常会沿三条互相分离的路径增长：提示词有一套模板系统，工具有一套调用协议，工作区文件又有一套资产管理。它们各自都能工作，但同一份能力必须实现多次，状态也很难在会话分支间保持一致。

PulsarAI 把问题重新表述为：

> 如何让文本、消息、数据、脚本和 Agent 操作都围绕同一份资源、同一个求值环境和同一条因果历史工作？

回答是三个原语：资源、求值、操作。

## 资源：一切可组合内容都是 Plugin 文件

角色设定、提示词、聊天入口、JSON、状态定义、正则、命令、Vue 组件、媒体和生成脚本都只是不同类型的 Plugin 文件。类型决定编辑器与 import 包装方式，但不改变它们作为资源的基本身份。

这带来两个重要结果：

1. 用户用同一种文件树组织所有资产，不必先理解多个功能中心。
2. 生成脚本只需要文件与插槽 API，不需要为每种资产再学习一套查询接口。

文件持久化采用“扁平文件 + 叶级空目录”。路径本身已经包含层级，再保存父子关系和目录节点只会制造同步问题。中间目录是派生视图，不是事实。

## 求值：所有动态能力进入同一个环境对象

宏不是一门新的模板语言。它只是从文本或消息中进入 JavaScript 环境的一种语法。Plugin JavaScript、插入条件、自定义工具和 CodeAct 也使用同一环境。

因此，新能力首先应该问：能否作为一个普通函数或值进入环境？如果可以，就不应再创建新的模型工具、新的宏语法或新的事件总线。

环境对象不是随意堆放全局变量。它按当前 Conversation 构造，只包含当前消息路径、角色包、启用 Plugin、草稿、回复目标及受控能力。`ctx` 只是这个对象自身的别名。

## 操作：变化属于因果历史

Agent 在生成中写文件时，真正需要保存的不是“这一刻完整文件树的副本”，而是“这条消息导致了什么变化”。因此 Conversation 持久化 create/edit/move/remove 操作。

这与消息分支天然一致：选择哪条消息路径，就重放哪组操作。重生成一个助手版本也会得到独立的资源演变。状态回退不需要特殊补丁，它只是选择了另一条事实路径。

CodeAct 正好成为操作的原子边界。一次函数调用要么完整提交，要么完整回滚。比起让每个 API 自己猜测错误恢复方式，这个边界更简单，也更容易统计和审计。

## 为什么 import 必须浅

`import` 的职责是找到一个资源、判断条件、按类型包装。递归解析属于 Sandbox。

如果 import 自己递归：

- read、chat、data 和 JavaScript 会各自产生不同解析行为；
- 多 Plugin 来源作用域很容易丢失；
- 循环检测和日志会散落在调用链里；
- 调用者无法选择先组合、过滤还是解析。

浅 import 让生成过程保持显式：先取得路径，再包装资源，最后统一递归解析。

## 为什么插槽返回路径

插槽是注册表，不是内容拼接器。返回 World 绝对路径有三个好处：

- 保留资源身份、所属 Plugin 和稳定诊断信息；
- 调用者决定何时 import、如何过滤和使用哪种解析器；
- 多 Plugin 文档中的 `@/` 可以在资源边界固定到正确来源。

把插槽结果提前变成字符串，会丢掉以上信息，并再次把插槽变成另一套上下文运行时。

## 为什么常用文件 API 是同步的

生成开始前，当前角色包、Conversation、消息路径和启用 Plugin 已经在内存里。对这些对象做路径解析或 Overlay 修改，不涉及 I/O。

所以 `read`、`ls`、`exists`、`slot.paths`、`write`、`edit` 等保持同步。普通编辑先改变内存状态，持久化在后台进行；生成期编辑只改变 Overlay。只有模型、数据库、网络、Host 和允许异步 JavaScript 的求值过程需要 Promise。

同步领域逻辑让 Plugin 脚本更容易读，也避免把数据库实现细节传播到整套架构。

## 三个所有权边界

### Package

Package 是角色与资源归属边界。它决定本地 Plugin、主要生成 Plugin 和启用的全局 Plugin，但不拥有消息实现。

### Plugin

Plugin 拥有文件、插槽、资源类型包装、运行环境组装和 Agent 能力。它不拥有会话分支和消息生命周期。

### Conversation

Conversation 拥有 chat、消息容器、消息版本、活动路径、草稿和 Overlay 操作。它引用 Package 与 Plugin，不复制它们。

如果一个功能同时碰到三者，应先找清它改变的是归属、资源还是因果历史，再把 UI 放到真正的所有者附近。

## Feature 与 Host 的边界

Feature 按用户可理解的能力组织。小 Feature 保持扁平，大 Feature 使用 `tree/`、`runtime/`、`messages/`、`components/` 等内容命名目录；不使用 application/domain/presentation 这类只描述技术层次的目录。

原生平台能力统一进入 `host/index.ts`。Renderer 只认识稳定 facade：共享能力直接位于 `host`，桌面和移动独占能力分别位于命名空间。这样桌面迁移到 Electron 不需要把 Electron API 泄漏到每个 Feature，移动端也不需要编译无意义的多窗口或 Playwright 逻辑。

## 面向用户的界面原则

界面不是通用工作区壳，而是当前 Feature 状态的直接表面：

- Conversation shell 只组合顶栏、消息线程和输入框；
- Plugin 资源以资产面板与文件编辑器覆盖层出现；
- PackageManager 与 ChatManager 独立管理各自实体；
- 设置页只组织真正存在的设置，不成为第二个 Feature 注册中心。

窄窗口与移动端不是桌面布局缩小。组件应提供 768px 以下的明确回退，并使用共享响应式状态；应用拥有的滚动区默认使用统一 ScrollArea。

## 如何判断一个新设计是否合适

在添加新功能前，依次回答：

1. 它的事实来源是什么？基础 Plugin、消息路径操作、Package，还是 Host 状态？
2. 它能否表示成资源、环境函数或操作，而不新增一套运行时？
3. 它是否真的需要异步，还是数据已经在内存？
4. 它的路径和关系能否使用稳定 ID，而不是可变名称？
5. 切换消息分支或版本后，它是否会自动回到正确状态？
6. 桌面与移动是否真的共享该能力？独占能力是否留在平台命名空间？
7. 模型是否可以经由 CodeAct 调用，还是正在偷偷增加第二个模型工具？
8. 用户能否从当前 Feature 的界面找到它，而不需要新的通用中心？

如果一个方案需要兼容层、事件总线、重复注册表和额外状态机才能成立，通常说明它没有落回这三个原语。

## 阅读代码的建议顺序

1. `src/features/Sandbox/sandbox.ts`：理解求值和递归宏。
2. `src/features/Plugin/tree/world-types.ts`：理解嵌套 World 节点模型。
3. `src/features/Plugin/runtime/self-api.ts`：理解文件与插槽 API。
4. `src/features/Plugin/runtime/environment.ts`：理解统一环境装配。
5. `src/features/Plugin/tree/world-update.ts`：理解操作重放与持久化更新。
6. `src/features/Conversation/messages/conversation-generation.ts`：理解完整生成路径。
7. `src/features/Plugin/agent/runtime/default-agent.ts`：理解 CodeAct 和 Agent 输出。
8. `host/contracts.ts` 与 `host/index.ts`：理解平台边界。

精确签名请继续阅读 [API 文档](/api/)。
