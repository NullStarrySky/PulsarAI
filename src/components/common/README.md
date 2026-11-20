# PulsarAI Common Components Guide (for Agents)

本文档归纳 `@/components/common` 下的所有通用 UI/交互组件及其核心用途，供后续开发与 Agent 参考使用。

所有组件均以独立文件夹组织，通过文件夹下的 `index.ts` 导出，并在 `@/components/common` 统一重导出。基础动效与尺寸配置工具维护在 `@/components/lib`。

---

## 组件清单与用途

### 1. 基础 UI 与表单控制

| 组件名 | 路径 | 核心用途与特性 |
| :--- | :--- | :--- |
| **`Button`** | `@/components/common/Button` | 现代化物理弹簧按钮，支持 `default`, `secondary`, `destructive`, `ghost`, `outline`, `link`, `glass` 变体；支持 `sm`, `md`, `lg`, `icon-sm` 等尺寸阶梯及加载状态。 |
| **`Badge`** | `@/components/common/Badge` | 徽章指示器，支持 `default`, `secondary`, `destructive`, `outline`, `surface` 等多种语义样式，用于状态标签或计数提示。 |
| **`Switch`** | `@/components/common/Switch` | 弹簧阻尼物理开关，支持 `v-model` 双向绑定，用于布尔设置控制。 |
| **`Slider`** | `@/components/common/Slider` | 滑动条输入组件，支持拖拽滑动、步长微调、当前值提示与轨道填充。 |
| **`ColorPicker`** | `@/components/common/ColorPicker` | 取色器套件（包含 `ColorPicker`, `ColorPickerPopover`, `ColorInput`），支持拾色面板、透明度/色相调节与 HEX/RGB/HSL 切换。 |
| **`Dialog`** | `@/components/common/Dialog` | 模态对话框套件（包含 `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`），提供平滑缩放与遮罩动效。 |

---

### 2. 滑动高亮与导航交互 (Glide 体系)

| 组件名 | 路径 | 核心用途与特性 |
| :--- | :--- | :--- |
| **`List`** | `@/components/common/List` | 核心滑动高亮列表，支持单选滑块平移、悬停滑块以及多选常驻切片连片无缝背景过渡；支持水平/垂直方向与百分比等分。 |
| **`Tabs`** | `@/components/common/Tabs` | 分段标签切换栏，基于 `List` 驱动药丸指示器，支持内容插槽基于切换方向左右流动进出过渡动画。 |
| **`CollapsibleButtonGroup`** | `@/components/common/CollapsibleButtonGroup` | 可折叠药丸按钮组，支持设置 `expandDirection`（`left`, `right`, `down`, `up`）向指定方向展开子按钮组，内建选中滑块与悬停菜单外壳联动。常用于折叠快捷导航、设置浮窗入口等。 |
| **`RadioGroup`** | `@/components/common/RadioGroup` | 现代化单选组，基于滑动滑块高亮与单选圆点展开/收缩过渡，支持选项说明与右侧 Tag。 |
| **`CheckboxGroup`** | `@/components/common/CheckboxGroup` | 现代化复选组，选项无生硬轮廓，选中项具有平滑勾选划线动画，支持多选项连片背景无缝融合。 |
| **`Select`** | `@/components/common/Select` | 下拉选择器，基于浮层弹出与内置滑动高亮列表，附带对勾标识与尺寸严格对齐。 |
| **`Dropdown`** | `@/components/common/Dropdown` | 下拉操作菜单，触发按钮配合悬停滑动高亮浮层，适用于上下文菜单与快捷选项列表。 |
| **`DropdownList`** | `@/components/common/DropdownList` | 联动悬停预览列表，悬停于列表项时右侧平滑滑出/平移单例变形外壳预览窗口，绝不重复销毁与挂载。 |
| **`RollingNumber`** | `@/components/common/RollingNumber` | 等宽滚轴滚动数字，支持鼠标滚轮切换、`< 1 / x >` 分页控制与丝滑数字上下翻滚。 |
| **`FileTree`** | `@/components/common/FileTree` | 现代化文件树套件（`FileTree`, `FileTreeItem`, `FileTreePreview`），支持折叠展开高度平滑过渡与悬停联动内容/子文件夹代码预览。 |

---

### 3. 会话与智能体专属组件

| 组件名 | 路径 | 核心用途与特性 |
| :--- | :--- | :--- |
| **`ChatMessage`** | `@/components/common/ChatMessage` | 消息气泡组件，支持 `user`（强调色右对齐）与 `assistant`（左对齐）布局，带自动布局位置平移 (`layout="position"`)、附件文件缩略图及悬停操作条。 |
| **`InputMessage`** | `@/components/common/InputMessage` | 智能输入框组件，自适应多行输入，支持附件预览与快捷键发送控制。 |
| **`ThinkingIndicator`** | `@/components/common/ThinkingIndicator` | 思考中脉冲呼吸指示器，适用于 LLM 思考或网络等待过程。 |
| **`ThinkingSteps`** | `@/components/common/ThinkingSteps` | 思考步骤展示组件（包含 Header, Content, Step, Details, Source 等），提供折叠展开面板与详细步骤溯源。 |
| **`AskUserQuestions`** | `@/components/common/AskUserQuestions` | 智能体交互提问组件，支持多道题目分页导航、数字快捷键选择、单选/多选/跳过提交及指示器。 |

---

### 4. 设置与卡片布局

| 组件名 | 路径 | 核心用途与特性 |
| :--- | :--- | :--- |
| **`SettingCardGroup`** | `@/components/common/settings` | 设置卡片组外壳，提供圆角卡片、毛玻璃底色、组标题/描述及子项自动分割线。 |
| **`SettingCardItem`** | `@/components/common/settings` | 设置卡片行，左侧标题与副标题排版，右侧可放置 Switch/Select/Button，下方可扩展颜色选择或滑动条。 |

---

## 导入规范

```typescript
// 1. 从根统一导入
import { Button, Switch, Tabs, CollapsibleButtonGroup, SettingCardGroup, SettingCardItem } from "@/components/common";

// 2. 或从具体组件目录导入
import { Tabs } from "@/components/common/Tabs";
import { CollapsibleButtonGroup } from "@/components/common/CollapsibleButtonGroup";
```
