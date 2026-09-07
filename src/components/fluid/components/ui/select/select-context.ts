import { inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";
import type { ItemRect } from "../../../hooks/use-proximity-hover";

// ── Select 上下文 ────────────────────────────────────────
//
// 基于 reka-ui Select，它拥有定位（popper 碰撞翻转）、关闭（外部按压、
// Escape）、列表键盘导航 + typeahead（开与闭）、combobox ARIA，
// 以及供表单使用的隐藏原生 <select>。本层保留邻近悬停 overlay、
// 弹簧开/关动画与动画勾选标记。
//
// reka-ui 相关说明：
//
// - 关闭时 reka 把 Content 的子内容渲染进一个分离的 fragment
//   （与 Radix React 相同），所以已选 SelectItem/ItemText 在 popup
//   打开前就已挂载，标签可以解析进 Value 节点——SelectContent 必须
//   无条件渲染，绝不能被本地 mounted 标志门控。
//
// - 退出动画：根保持两个 open 状态：`open`（立即翻转，驱动 motion
//   目标）与 `radixOpen`（reka 看到的值；退出动画结束后由 `unmount`
//   释放）。

// 选中后 popup 保持打开的时长，让确认——勾选画入与选中背景弹向所选行
// ——可见，而不是被 ~60ms 的关闭淡出切断。Escape 与外部按压仍然立即关闭。
export const selectionAckMs = 300;

export interface SelectContextValue {
  value: ComputedRef<string> | Ref<string>;
  open: Ref<boolean>;
  /** 释放 reka 的 open 状态（退出动画结束后）。 */
  unmount: () => void;
  /** value → label 注册表：SelectItem 挂载时注册（包括在关闭状态的
   *  detached fragment 里挂载），SelectTrigger 据此自行渲染选中 label，
   *  不依赖 reka 的 ItemText portal —— 弹层卸载的瞬间 portal 会被移除，
   *  reka 的回填会闪一帧 placeholder。 */
  registerLabel: (value: string, label: string) => void;
  labelFor: (value: string) => string | null;
}

export const SelectKey: InjectionKey<SelectContextValue> = Symbol("fluid-select");

export function provideSelectContext(ctx: SelectContextValue) {
  provide(SelectKey, ctx);
}

export function useSelectContext(): SelectContextValue {
  const ctx = inject(SelectKey, null);
  if (!ctx) throw new Error("Select compound components must be inside <Select>");
  return ctx;
}

// Content 上下文（邻近悬停）
export interface SelectContentContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  claimIndex?: () => number;
  activeIndex: ComputedRef<number | null> | Ref<number | null>;
  checkedIndex?: number | Ref<number | undefined> | ComputedRef<number | undefined>;
  isMeasured: Ref<boolean>;
  itemRects: Ref<ItemRect[]>;
}

export const SelectContentKey: InjectionKey<SelectContentContextValue> =
  Symbol("fluid-select-content");

export function provideSelectContentContext(ctx: SelectContentContextValue) {
  provide(SelectContentKey, ctx);
}

export function useSelectContentContext(): SelectContentContextValue | null {
  return inject(SelectContentKey, null);
}
