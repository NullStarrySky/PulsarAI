import {
  computed,
  inject,
  provide,
  ref,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
} from "vue";
import { toValue } from "vue";

export type SizeVariant = "default" | "compact";

export interface SizeClasses {
  /** 这些 class 所属的变体——用于条件判断。 */
  variant: SizeVariant;
  /** 有界控件高度——按钮、输入框、select 触发器、subtle tabs——以及
   *  列表/菜单行（select 选项、dropdown、checkbox 和 radio 行）。
   *  刻意共用一个 token：弹出层里的行与打开它的触发器共享此高度，因此对齐。 */
  control: string;
  /** `control` 的数字形式，供需要原始像素的消费方使用。 */
  controlHeight: number;
  /** 有内边距的分段列表里的 tab 触发器高度。保证
   *  `segmentPad` + `segmentItem` 加回来正好等于 control 高度——
   *  分段控件的外框与整体高度阶梯保持一致。 */
  segmentItem: string;
  /** 分段列表围绕 tabs 的内边距。 */
  segmentPad: string;
  /** 控件内的正文文本。 */
  text: string;
  /** 有界控件的横向内边距（select 触发器、输入框）。 */
  px: string;
  /** 列表/菜单行的横向内边距；它们位于有内边距的弹出层/分组内，
   *  需要比有界控件更小的缩进。 */
  itemPx: string;
  /** 图标/控件字形与其标签之间的间距，以及一行中相邻控件之间的间距
   *  （工具栏、过滤栏、按钮簇）。密度既是间距也是控件高度，
   *  因此 compact 档将其减半。 */
  gap: string;
  /** 字形尺寸（px）：控件内的前导/尾随图标，以及 checkbox 方块 / radio 圆点。 */
  icon: number;
}

export const sizeMap: Record<SizeVariant, SizeClasses> = {
  // 36px — the default control height. Matches a 13px label with comfortable
  // breathing room and keeps controls a workable pointer target.
  default: {
    variant: "default",
    control: "h-9",
    controlHeight: 36,
    segmentItem: "h-7",
    segmentPad: "p-1",
    text: "text-[13px]",
    px: "px-3",
    itemPx: "px-2",
    gap: "gap-2",
    icon: 16,
  },
  // 28px — the compact height for dense surfaces: filter bars, toolbars,
  // table headers, sidebars. One step down in text (12px) and icon (14px)
  // so the whole control shrinks together, not just its box.
  compact: {
    variant: "compact",
    control: "h-7",
    controlHeight: 28,
    segmentItem: "h-6",
    segmentPad: "p-0.5",
    text: "text-[12px]",
    px: "px-2.5",
    itemPx: "px-1.5",
    gap: "gap-1",
    icon: 14,
  },
};

/** 类型阶梯的一个角色：每档的 px。 */
export interface TypeScaleStep {
  default: number;
  compact: number;
}

/**
 * 按角色的类型阶梯（px 值）。
 *
 * default 列是系统默认形态；compact 列把每个角色下调一档，让密集区域
 * 读起来是同一层级的更小兄弟，而不是被挤压的复制品。
 */
export const typeScale = {
  /** 页面标题。 */
  display: { default: 28, compact: 24 },
  /** 区块标题、对话框标题。 */
  title: { default: 16, compact: 15 },
  /** 卡片标题、聊天气泡、强调行。 */
  subtitle: { default: 14, compact: 13 },
  /** 控件标签与正文——`SizeClasses.text`。 */
  body: { default: 13, compact: 12 },
  /** 次要文本：描述、meta 行、错误、眉标与分组标签。 */
  caption: { default: 12, compact: 11 },
} as const satisfies Record<string, TypeScaleStep>;

export type TypeScaleRole = keyof typeof typeScale;

export type TypeScale = Record<TypeScaleRole, number>;

export interface SizeContextValue {
  size: ComputedRef<SizeVariant>;
  setSize: (size: SizeVariant) => void;
  classes: ComputedRef<SizeClasses>;
}

const SizeKey: InjectionKey<SizeContextValue> = Symbol("fluid-size");

/** 解析生效的尺寸变体：显式覆盖 > Provider > "default"。 */
export function useSizeVariant(
  override?: MaybeRefOrGetter<SizeVariant | null | undefined>
): ComputedRef<SizeVariant> {
  const ctx = inject(SizeKey, null);
  return computed(() => {
    const o = override === undefined ? undefined : toValue(override);
    return o ?? ctx?.size.value ?? "default";
  });
}

/** 解析尺寸 class：显式覆盖 > Provider > "default"。 */
export function useSize(
  override?: MaybeRefOrGetter<SizeVariant | null | undefined>
): ComputedRef<SizeClasses> {
  const variant = useSizeVariant(override);
  return computed(() => sizeMap[variant.value]);
}

export function useSizeContext(): SizeContextValue {
  const ctx = inject(SizeKey, null);
  if (!ctx) throw new Error("useSizeContext must be used within a SizeProvider");
  return ctx;
}

/** 当前档位下的类型阶梯（每个角色的 px）。 */
export function useTypeScale(
  override?: MaybeRefOrGetter<SizeVariant | null | undefined>
): ComputedRef<TypeScale> {
  const variant = useSizeVariant(override);
  return computed(() => ({
    display: typeScale.display[variant.value],
    title: typeScale.title[variant.value],
    subtitle: typeScale.subtitle[variant.value],
    body: typeScale.body[variant.value],
    caption: typeScale.caption[variant.value],
  }));
}

export interface ProvideSizeOptions {
  /** 受控变体——把整个区域钉在某一档（例如紧凑的过滤栏）。覆盖内部状态。 */
  size?: MaybeRefOrGetter<SizeVariant | undefined>;
  defaultSize?: SizeVariant;
}

/**
 * 提供尺寸上下文。受控 Provider 完全忽略 setSize——对被遮蔽的内部状态的
 * 后台写入，会在将来移除 size 覆盖时突然冒出来。
 */
export function provideSize(options: ProvideSizeOptions = {}): SizeContextValue {
  const internalSize = ref<SizeVariant>(options.defaultSize ?? "default");

  const resolved = computed<SizeVariant>(() => {
    const o = options.size !== undefined ? toValue(options.size) : undefined;
    return o ?? internalSize.value;
  });
  const isControlled = computed(() => {
    const o = options.size !== undefined ? toValue(options.size) : undefined;
    return o !== undefined;
  });

  function setSize(next: SizeVariant) {
    if (isControlled.value) return;
    internalSize.value = next;
  }

  const value: SizeContextValue = {
    size: resolved,
    setSize,
    classes: computed(() => sizeMap[resolved.value]),
  };
  provide(SizeKey, value);
  return value;
}
