# fluid-vue 增强特性与 shadcn-vue 平替指南

`fluid-vue` 是对 [fluidfunctionalism.com](https://www.fluidfunctionalism.com) 「Fluid Functionalism」设计哲学的 Vue 3 移植实现，并针对 **shadcn-vue** 生态进行了深度对齐。

你可以直接使用 `fluid-vue` 的组件来无缝替换现有应用中的 `shadcn-vue` 组件，享受开箱即用的**磁吸邻近高亮**、**物理弹簧动效**与**可变字重过渡**，同时几乎无需调整任何模板和数据绑定代码。

---

## 一、 shadcn-vue 对齐矩阵

| shadcn-vue 规范 | fluid-vue 对应组件 | 支持的标准 API / 语法 | 额外增强特性 |
| :--- | :--- | :--- | :--- |
| **Button** | `Button` | `variant`（`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`）<br>`size`（`default`, `sm`, `lg`, `icon`）<br>`asChild`<br>插槽直接传入图标与文本（横向居中不折行） | 按压 1px 几何等距收缩（非变形缩放）、内置骨架 Spinner、可变字重 |
| **Badge** | `Badge` | `variant`（`default`, `secondary`, `destructive`, `outline`）<br>`size`（`default`, `sm`） | 17 色彩系统、dot 指示点模式、cap 高度光学对齐 |
| **Accordion** | `Accordion`<br>`AccordionItem`<br>`AccordionTrigger`<br>`AccordionContent` | `v-model` / `modelValue`<br>`type="single" \| "multiple"`<br>`collapsible`<br>`AccordionItem` **无需传递 `:index`** | 邻近光标悬停预测高亮、自测布局高度物理弹簧折叠（免疫嵌套缩放畸变） |
| **Card** | `Card`<br>`CardHeader`<br>`CardTitle`<br>`CardDescription`<br>`CardAction`<br>`CardContent`<br>`CardFooter` | 完全相同的六件套结构，支持标准 HTML 容器属性与 class | 独立拉伸 overlay、可折叠关闭按钮（`dismissible`）、卡片组自动分隔线避让 |
| **Dialog** | `Dialog`<br>`DialogTrigger`<br>`DialogContent`<br>`DialogHeader`<br>`DialogTitle`<br>`DialogDescription`<br>`DialogFooter`<br>`DialogClose` | `v-model:open` / `open` / `@update:open`<br>`DialogContent` 布局与右上角关闭钮 | `spring.slow` 物理缩放渐入渐出、自动分层表面提升（Surface Elevation） |
| **DropdownMenu** | `DropdownMenu`<br>`DropdownMenuTrigger`<br>`DropdownMenuContent`<br>`DropdownMenuGroup`<br>`DropdownMenuItem`<br>`DropdownMenuSub`<br>`DropdownMenuSubTrigger`<br>`DropdownMenuSubContent`<br>`DropdownMenuLabel`<br>`DropdownMenuSeparator` | 标准 shadcn-vue 结构与递归子菜单用法：<br>`<DropdownMenuSub>` 配合 SubTrigger 与 SubContent 任意深度嵌套；<br>`MenuItem` 支持自动分配索引 | 递归级独立邻近悬停预测、多级浮层弹簧过渡、自适应高亮滑动块、SurfaceElevation 逐层抬升 |
| **Select** | `Select`<br>`SelectTrigger`<br>`SelectValue`<br>`SelectContent`<br>`SelectItem` | `v-model` / `modelValue`<br>`<SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>`<br>`SelectItem` **无需传递 `:index`** | 300ms 选中确认弹簧画入微动效、根级 Label 响应式注册表（弹层销毁防闪烁） |
| **Tabs** | `Tabs`<br>`TabsList`<br>`TabsTrigger`<br>`TabsContent` | `v-model` / `modelValue`<br>`<TabsTrigger value="...">标签</TabsTrigger>`<br>`<TabsContent value="...">内容</TabsContent>` | 乐观滑块跳动（点击首帧即移动）、表面抬升指示器、邻近光标预览 |
| **CheckboxGroup** | `CheckboxGroup`<br>`CheckboxItem` | `CheckboxGroup :checked-indices="..."`<br>`CheckboxItem` 支持插槽自定义内容，自动索引 | 连续项背景块平滑融合与分裂（`Merge/Split` 流体动效） |
| **Switch** | `Switch` | `v-model` / `v-model:checked`<br>支持原子级用法（无内置 label）与行级便捷用法 | 真实拖拽物理手势、防手震死区（Deadzone）、悬停 pill 动态延伸、按压弹性挤压 |
| **Slider** | `Slider` | `v-model` / `modelValue`（支持数字或数组）<br>`min`, `max`, `step`, `disabled` | 步进点遮罩（pips）、边到边 scrubber 模式、悬停数值气泡预览 |
| **Tooltip** | `Tooltip`<br>`TooltipProvider`<br>`TooltipTrigger`<br>`TooltipContent` | 标准复合组件语法：`<Tooltip><TooltipTrigger /><TooltipContent /></Tooltip>`<br>同时支持快捷语法：`<Tooltip content="...">触发器</Tooltip>` | 光标轴向跟随（`followCursor="x" \| "y"`）、物理弹性平滑滑入、三态强制受控 |

---

## 二、 核心增强效果技术解析

### 1. Button：几何按压收缩 (Geometric Inset Press)
*   **传统做法**：大多数 UI 库（包括默认 Tailwind/shadcn 样式）采用 `active:scale-95`。对于宽按钮（如 300px），2% 的缩放会在横向产生 6px 变形，而纵向只有不到 1px，导致视觉长宽比严重失真。
*   **fluid-vue 增强**：使用不透明 `color-mix()` 与 `box-shadow spread` 补偿技术。静止时表面向内收缩 1px，外围用 1px spread 补齐；按下时 spread 归零。无论按钮多长多宽，四周每条边都精确收缩 1px，保持完美的几何刚性。
*   **排版修复**：移除了之前的 `leadingIcon/trailingIcon` 参数，内部直接使用 `inline-flex items-center justify-center gap-2 whitespace-nowrap`。在插槽中自由混排 Phosphor 图标和文本时，保证绝对水平居中对齐，绝无意外换行。

### 2. Accordion & CheckboxGroup：连续块与邻近悬停 (Proximity Hover & Merge/Split)
*   **邻近预测**：使用全局指针监听与 `useProximityHover`，在鼠标接近目标元素之前就提前点亮微弱的高亮层，大幅提升界面的交互反馈灵敏度与防误触体验。
*   **连续块融合分裂**：在 `CheckboxGroup` 中，当用户勾选相邻的几个选项时，原本独立的选中背景会自动融合为一个平滑连通的连续卡片；中间取消勾选时，背景又会以弹簧流体动效顺滑裂开。

### 3. 可变字重过渡 (Variable Font-Weight Transition)
*   **传统做法**：在 hover 或 active 时改变 `font-bold` 会导致文字宽度改变，引起整行文字跳动和重排抖动。
*   **fluid-vue 增强**：采用**双层 Ghost-span** 测量机制，底层常驻一个不可见的 `font-weight: 600` 副本牢牢撑住盒子宽度，顶层可见文本使用 `fontVariationSettings` 进行无级毫秒级过渡，文字加粗时外围容器尺寸纹丝不动。

### 4. Switch：真实物理拖拽与形态挤压 (Draggable Squish Physics)
*   支持点击瞬时切换与鼠标/手指原生指针拖拽手势。
*   在按下未松开时，滑块（thumb）会呈现椭圆形的按压挤压形变（press shrink & extend）；悬停时滑块朝滑动方向轻微延伸（pill extend）；越过中线时平滑吸附释放。

### 5. Select & Dialog：防闪烁与确认动效 (Ack Animation & Anti-Flash)
*   **选择确认（Ack）**：在 Select 选中某个选项时，弹窗不会瞬间突兀关闭，而是延迟 300ms 播放一个打钩画入与背景弹射动画，给用户明确的操作反馈后顺畅退出。
*   **防闪烁注册表**：通过跨组件响应式 Label 映射表，彻底根除了 reka-ui 在 Content 卸载的一瞬间 ItemText 丢失导致 Select 触发器闪烁一帧 placeholder 的顽固缺陷。

---

## 三、 从 shadcn-vue 无痛迁移示例

### 示例 1：Button
```vue
<script setup>
import { Button } from "fluid-vue";
import { Plus } from "@/lib/phosphor-icons";
</script>

<template>
  <!-- 直接像 shadcn-vue 一样在 slot 传入图标与文字 -->
  <Button variant="default" size="sm">
    <Plus class="size-4" />
    新建任务
  </Button>
</template>
```

### 示例 2：Tabs
```vue
<script setup>
import { ref } from "vue";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "fluid-vue";

const activeTab = ref("account");
</script>

<template>
  <Tabs v-model="activeTab">
    <TabsList>
      <TabsTrigger value="account">账户设置</TabsTrigger>
      <TabsTrigger value="password">安全密码</TabsTrigger>
    </TabsList>
    <TabsContent value="account">账户面板内容</TabsContent>
    <TabsContent value="password">密码修改内容</TabsContent>
  </Tabs>
</template>
```

### 示例 3：Select
```vue
<script setup>
import { ref } from "vue";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "fluid-vue";

const fruit = ref("");
</script>

<template>
  <Select v-model="fruit">
    <SelectTrigger class="w-[180px]">
      <SelectValue placeholder="选择水果" />
    </SelectTrigger>
    <SelectContent>
      <!-- 无需传递 :index="0"，自动注册邻近悬停 -->
      <SelectItem value="apple">苹果</SelectItem>
      <SelectItem value="banana">香蕉</SelectItem>
    </SelectContent>
  </Select>
</template>
```

### 示例 4：Switch 便捷与受控绑定
```vue
<script setup>
import { ref } from "vue";
import { Switch } from "fluid-vue";

const notifications = ref(true);
const airplaneMode = ref(false);
</script>

<template>
  <!-- 原子级 Switch（无文字标签） -->
  <div class="flex items-center gap-2">
    <Switch id="notify" v-model="notifications" />
    <label for="notify">接收推送通知</label>
  </div>

  <!-- 行级 Switch（文字点击整行响应，带字重加粗反馈） -->
  <Switch v-model="airplaneMode" class="mt-4">
    飞行模式
  </Switch>
</template>
```
