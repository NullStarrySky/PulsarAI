# 基本界面

PulsarAI 的基本界面由通用 Shell、资源标签页、左右侧栏、设置、命令搜索和通知组成。UI Feature 只拥有通用承载机制；对话、插件、设置页面等具体行为仍由各自 Feature 实现并注册。

## 界面结构

```text
AppShell
├─ ShellTopBar
│  ├─ 左侧栏开关
│  ├─ 工作区标签页
│  ├─ 标签状态
│  ├─ 右侧栏开关
│  └─ 桌面窗口控制
├─ ShellLeftSidebar
├─ MainWorkspace
├─ ShellRightSidebar
├─ SettingsDialog
├─ CommandSearchDialog
└─ Notifications
```

整个应用使用 `100dvh` 并阻止 Shell 自身滚动。每个工作区页面负责自己的内部滚动区域。

## 顶部栏与标签页

打开一个资源时，`layout-store` 创建或激活对应标签页。资源标签 ID 使用 `resourceType:resourceId`，因此再次打开同一资源会更新并激活已有标签，而不是创建重复标签。

每个标签保存：

- 标题；
- 资源类型和资源 ID；
- 可选角色包 ID；
- 可选资源参数；
- 是否允许关闭；
- 可选状态。

标签支持：

- 点击激活；
- 关闭按钮或鼠标中键关闭；
- 右键弹出到子窗口；
- 相邻标签切换；
- 按资源或角色包批量关闭。

标签状态是通用 UI 状态：

| 状态 | 表现 |
| --- | --- |
| `loading` | 旋转图标 |
| `success` | 成功图标 |
| `warning` | 警告图标 |
| `error` | 错误图标 |

Feature 可以为自己的资源标签设置状态，但图标和顶部栏渲染由 UI Shell 负责。

## 左右侧栏

Shell 不直接实现业务侧栏。Feature 通过 sidebar registry 注册左侧和右侧组件。

当前 Conversation Feature 注册：

- 左侧：角色包、分类、内置页面入口；
- 右侧：对话列表，以及插件列表与权限。

顶部栏只负责切换侧栏。桌面端左右侧栏可以独立开关；移动布局中打开一侧会关闭另一侧。

## 主工作区

Feature 通过 workspace resource registry 注册资源渲染器：

```ts
registerWorkspaceResource({
  type: "conversation",
  component: ConversationWorkspacePage,
})
```

也可以为某个内置资源注册更精确的 `type + id`：

```ts
registerWorkspaceResource({
  type: "builtin",
  id: "conversation-new",
  component: ConversationLandingPage,
})
```

主工作区优先匹配精确注册，再回退到资源类型注册。渲染组件会收到 `resourceId`、可选 `packageId` 和当前标签对象。

活动资源使用 `KeepAlive`，在标签间切换时保留页面实例和局部编辑状态。没有标签时显示注册的空白工作区；没有对应渲染器时显示统一回退提示。

Feature 特定页面必须留在所属 Feature 中，通过注册表接入，不应移动到 `Resources/UI`。

## 命令搜索

默认使用 `Ctrl+K` 打开命令搜索。它统一搜索：

- 已注册命令；
- 角色包；
- 对话与其他可打开资源。

全局键盘监听会避开输入框、文本域和可编辑区域，只有搜索命令可以在编辑状态下继续触发。

命令的实际行为应放在所属 Feature 的 `actions.ts`。UI 负责注册和路由通用命令，不接管业务实现。

## 默认快捷键

| 操作 | 默认快捷键 |
| --- | --- |
| 全局搜索 | `Ctrl+K` |
| 切换左侧栏 | `Ctrl+B` |
| 切换右侧栏 | `Ctrl+Shift+B` |
| 打开设置 | `Ctrl+,` |
| 新建对话 | `Ctrl+N` |
| 关闭当前标签页 | `Ctrl+W` |
| 下一个标签页 | `Ctrl+Tab` |
| 上一个标签页 | `Ctrl+Shift+Tab` |
| 刷新应用 | `Ctrl+R` |
| 清空角色包数据并刷新（保留设置与密钥） | `Ctrl+Shift+R` |
| 重生成最后一条消息 | `Ctrl+Shift+G` |

命令目录和快捷键映射相互独立。用户可以在快捷键系统中修改映射，而命令 ID 保持稳定。

应用全局禁用浏览器原生右键菜单。输入框、文本域和可编辑区域提供剪切、复制、粘贴菜单；角色包和插件文件树继续把右键转发到各自已有的 `…` 操作菜单。

## 设置

设置使用独立对话框承载。具体设置页由各 Feature 提供。

设置表单应优先复用：

- `SettingForm`：组织同一设置页的字段；
- `SettingFormField`：提供标题、说明和控件区域；
- Feature 自己的 store：保存业务状态。

外观设置包括：

- 主题与明暗模式；
- 独立于主题的全局自定义 CSS；
- 字体和字号；
- UI 缩放；
- 移动导航栏模式；
- 移动布局预览。

主题使用共享 CSS 变量，组件应优先使用 `background`、`foreground`、`muted`、`border`、`primary` 等语义变量。

自定义 CSS 保存在 appearance snapshot 的 `customCss` 字段中，由
`appearance-store.ts` 写入独立的 `#pulsarai-custom-css` 样式节点，并在主题
样式之后实时应用。它不参与主题导入、解析或切换，因此适合覆盖普通选择器；
旧版 snapshot 缺少该字段时自动回退为空字符串。

主题导入按钮打开 CSS 导入浮窗。用户可以读取 `.css` 文件或直接粘贴源码，
在确认前检查和编辑内容；确认后解析为自定义主题并立即选中。该入口与“自定义
CSS”字段相互独立。

## 输入框工具栏布局

输入框工具栏不是 Conversation 工作区中的硬编码顺序，而是外观 store 保存的标准化布局：

```ts
type ComposerToolId =
  | "model"
  | "reasoning"
  | "attachment"
  | "whiteboard"
  | "map"
  | "fullscreen"

interface ComposerToolbarLayout {
  left: ComposerToolId[]
  right: ComposerToolId[]
  unused: ComposerToolId[]
}
```

每个已知工具必须且只能出现一次。新增工具如果不在旧配置中，标准化过程会自动把它加入默认区域。

`reasoning` 显示当前会话的思考深度按钮。点击后使用五档滑块选择关闭、低、中、高或超高；它由 Conversation 持久化，但通过共享工具栏目录决定位置。

`map` 打开当前会话的分支地图及消息搜索；输入关键词后，Conversation 负责用收藏优先的消息预览覆盖地图。它属于 Conversation 的领域行为，但与其他输入框工具一样通过共享目录决定显示区域与顺序。

工具栏布局仍由共享目录、标准化函数和 appearance store 管理，但不在设置页暴露布局编辑器。

## 响应式布局

共享 responsive store 使用两个信号决定移动布局：

- 当前运行平台是移动平台；
- 视口宽度不超过 `767px`。

任一条件成立时，`isMobileLayout` 为真，并在根元素写入 `.mobile-layout` 和 `data-mobile-layout`。

进入移动布局时：

- 左右侧栏自动关闭；
- 打开标签或设置后侧栏自动关闭；
- 同一时间只显示一侧抽屉；
- Shell 顶部栏高度和触摸目标增大；
- 窗口最小化、最大化、关闭按钮隐藏；
- Feature 页面使用自己的显式 `<768px` 回退布局。

开发时不要在各组件重复读取 `window.innerWidth`。应复用 shared responsive state，并同时考虑窄桌面窗口和真实移动平台。

## 子窗口

标签页右键菜单可以把资源弹出到 Tauri 子窗口。

子窗口通过 URL 参数接收：

- Shell 模式；
- 资源类型和 ID；
- 可选角色包 ID；
- 标题；
- 资源参数。

简化 Shell 模式会关闭并隐藏左右侧栏，只保留目标资源和必要顶部栏。子窗口协议和 Tauri 适配位于 SubWindow Feature，UI 只消费结构化参数。

## 通知

应用内即时反馈通过 Notivue 渲染。功能级原生通知和内置通知中心统一经过 Notification Feature 的服务。

外部通知是默认通道；明确使用 `channel: "internal"` 时才写入内置通知中心。Feature 不应直接复制通知平台判断。

## 界面扩展约定

增加新工作区功能时：

1. 在所属 Feature 中实现页面。
2. 通过 workspace resource registry 注册资源类型或内置资源 ID。
3. 使用 `layout.openResourceTab` 打开资源。
4. 如果需要搜索或快捷键，把行为放在所属 Feature 的 `actions.ts`。
5. 如果需要标签进度，使用通用 tab status。
6. 复用 shadcn-vue 组件和主题变量。
7. 明确设计 `<768px` 的布局回退和可用触摸目标。

增加新的通用 Shell 机制时，才应修改 UI Feature。
