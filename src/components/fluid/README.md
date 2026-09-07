# fluid（Fluid Functionalism for Vue）

自包含的组件文件夹，从独立移植项目 `vue-fluid` 整体迁入。原始项目含 showcase 应用，保留在 `Documents/vue-fluid`。

## 内容

- `components/ui/` — 全部组件：Button、Badge、Accordion 家族、Card 全家族、Dialog 家族、Dropdown（内联）/ DropdownMenu（弹出）+ MenuItem、RadioGroup/RadioItem、CheckboxGroup/CheckboxItem（含 merge/split 边界动画）、Select 家族、Combobox、Slider（compact/comfortable 双引擎自动分发）、Switch、Tabs 家族、ThinkingIndicator、Tooltip
- `hooks/` — `useProximityHover`（磁吸邻近高亮测量）、`useMergeSplitBlocks`（选中块合并/分裂边界动画）、`useTouchPrimary`
- `lib/` — spring 三档令牌、shape/size/surface 上下文、图标注册表（`provideIcons` 可整体替换 Lucide）、`Elevated`（浮层抬升）
- `index.ts` — 统一导出入口

## 依赖

- `motion-v`（已安装）— 动画引擎
- `@fontsource-variable/inter`（已安装）— 字重过渡动画依赖 Inter Variable
- `reka-ui`、`lucide-vue-next`、`clsx`、`tailwind-merge` — 宿主已有

## 样式

`src/styles/fluid.css` 已在 `globals.css` 中 `@import`，提供组件所需的
`--hover/--active/--selected/--focus-ring`、`--surface-1..8` 阶梯与配套阴影、
圆角补充档（2xl–4xl）、shimmer/spinner 关键帧、shape 切换的 `.transitioning`
守卫规则。颜色基元（background/foreground/accent/border/muted…）复用宿主
`globals.css` 令牌，随宿主主题与暗色模式自动适配。

## 使用要点

```ts
import { Button, RadioGroup, RadioItem, provideShape } from "@/components/fluid";
```

- 组件无全局注册，按需导入；相对路径在文件夹内自洽。
- **字重过渡**：把组件放进带 `class="fluid-root"` 的容器（激活 Inter Variable）。
- **形状切换**：`provideShape()` 会在 `<html>` 上写 `--shape-input-radius` 并
  加 `.transitioning` 守卫类；Dropdown/Checkbox/Combobox 恒用 `rounded` 小圆角，
  不随全局 pill 形状。
- **表面层级**：浮层组件内部已通过 `Elevated` 沿宿主 `SurfaceProvider` 自动抬升；
  无 Provider 时从 1 级起步。
- **尺寸阶梯**：省略 `size` prop 时组件跟随外围 `provideSize`（默认 36px，
  compact 28px）。
- Vue 与 React 的行为差异记录见原项目 `vue-fluid/README.md` 的「移植中的
  关键决策」一节（Boolean prop 受控判断、Fragment slot 扫描、挂载同步测量、
  Select label 注册表）。
