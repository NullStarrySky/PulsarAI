import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";

export type CardOrientation = "card" | "inline";
export type CardBorder = "none" | "outlined";

// ── 组上下文 ────────────────────────────────────────────

export interface CardGroupContextValue {
  registerItem: (index: number, element: HTMLElement | null) => void;
  /** 组的挂载顺序里领取一个稳定的邻近索引。 */
  claimIndex: () => number;
  releaseIndex: (index: number) => void;
  activeIndex: Ref<number | null>;
  /** 持久选中卡片的索引，或 -1。它的邻居会放下 otherwise 会切过选中填充的
   *  细分隔线。 */
  selectedIndex: Ref<number>;
  orientation: CardOrientation;
  columns: number;
  count: Ref<number>;
  /** 各卡片携带自己的边框/瓦片形状（分离的网格）。 */
  separated: boolean;
  /** 相邻卡片之间画内部细线分隔。 */
  divided: boolean;
  outlined: boolean;
}

export const CardGroupKey: InjectionKey<CardGroupContextValue> = Symbol("fluid-card-group");

export function provideCardGroup(ctx: CardGroupContextValue) {
  provide(CardGroupKey, ctx);
}

export function useCardGroup(): CardGroupContextValue | null {
  return inject(CardGroupKey, null);
}

// ── 每卡片上下文 ────────────────────────────────────────
// 让组合部件（标题、header、footer…）无需逐层传 props 就能适配所在卡片：
// 标题读取 `emphasized` 来做字重动画；部件读取 `orientation` 切换内边距/排布。

export interface CardContextValue {
  emphasized: ComputedRef<boolean>;
  orientation: CardOrientation;
  clickable: ComputedRef<boolean>;
  /** 持有完整 CardImage 的 inline 卡片把文本 + 动作居中排在图片旁的
   *  一列里，footer 落到文本下方（紧贴并垂直居中）而不是拖在右边。 */
  hasImage: ComputedRef<boolean>;
}

export const CardKey: InjectionKey<CardContextValue> = Symbol("fluid-card");

export function provideCardContext(ctx: CardContextValue) {
  provide(CardKey, ctx);
}

export function useCardContext(): CardContextValue {
  const fallback: CardContextValue = {
    emphasized: computed(() => false),
    orientation: "card",
    clickable: computed(() => false),
    hasImage: computed(() => false),
  };
  return inject(CardKey, fallback) ?? fallback;
}
