/**
 * Button 的 cva 等价物——变体查表 + 基础 class。
 */
/**
 * Button 的 cva 等价物——变体查表 + 基础 class。
 */
export type ButtonVariant =
  | "default"
  | "primary"
  | "secondary"
  | "outline"
  | "tertiary"
  | "ghost"
  | "destructive"
  | "link";

export type ButtonSizeCanonical = "default" | "compact" | "icon" | "icon-compact";
export type ButtonSize =
  | ButtonSizeCanonical
  | "sm"
  | "md"
  | "lg"
  | "icon-sm"
  | "icon-lg";

export const legacySizeAliases: Partial<Record<ButtonSize, ButtonSizeCanonical>> = {
  sm: "compact",
  md: "default",
  lg: "default",
  "icon-sm": "icon-compact",
  "icon-lg": "icon",
};

const BASE =
  "group relative isolate inline-flex items-center justify-center outline-none cursor-pointer " +
  "transition-colors duration-80 whitespace-nowrap " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]";

const VARIANTS: Record<ButtonVariant, string> = {
  default: "text-background",
  primary: "text-background",
  secondary: "text-foreground",
  outline: "text-foreground",
  tertiary: "text-foreground",
  ghost: "text-muted-foreground hover:text-foreground",
  destructive: "text-destructive-foreground",
  link: "text-foreground underline-offset-4 hover:underline !shadow-none !bg-transparent",
};

// 所有控件共享的两步尺寸阶梯——见 /docs/sizes。
// default = 36px 控件高度，compact = 28px 用于密集表面。
const SIZES: Record<ButtonSizeCanonical, string> = {
  default: "h-9 px-4 text-[13px] gap-2",
  compact: "h-7 px-3 text-[12px] gap-1.5",
  icon: "h-9 w-9 p-0 [&_svg]:h-4 [&_svg]:w-4",
  "icon-compact": "h-7 w-7 p-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
};

export function buttonVariants(opts: {
  variant?: ButtonVariant | null;
  size?: ButtonSizeCanonical;
}): string {
  const variant = opts.variant ?? "default";
  const size = opts.size ?? "default";
  return [BASE, VARIANTS[variant], SIZES[size]].join(" ");
}

/* 按压效果：surface 层位于按钮内侧 1px，一圈同色 box-shadow spread 把它
   补回到完整边界。按下时 spread 收缩，让 surface 每侧精确缩小 1px */
export const bgVariants: Record<ButtonVariant, string> = {
  default:
    "[--btn-bg:var(--foreground)] group-hover:[--btn-bg:color-mix(in_oklab,var(--foreground)_90%,var(--background))] group-active:[--btn-bg:color-mix(in_oklab,var(--foreground)_80%,var(--background))] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  primary:
    "[--btn-bg:var(--foreground)] group-hover:[--btn-bg:color-mix(in_oklab,var(--foreground)_90%,var(--background))] group-active:[--btn-bg:color-mix(in_oklab,var(--foreground)_80%,var(--background))] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  secondary:
    "[--btn-bg:var(--accent)] group-hover:[--btn-bg:color-mix(in_oklab,var(--accent)_80%,var(--background))] group-active:[--btn-bg:var(--accent)] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  outline:
    "bg-transparent shadow-[0_0_0_1px_var(--border),inset_0_0_0_0px_var(--border)] group-hover:bg-hover group-active:bg-active group-active:shadow-[0_0_0_0px_var(--border),inset_0_0_0_1px_var(--border)]",
  tertiary:
    "bg-transparent shadow-[0_0_0_1px_var(--border),inset_0_0_0_0px_var(--border)] group-hover:bg-hover group-active:bg-active group-active:shadow-[0_0_0_0px_var(--border),inset_0_0_0_1px_var(--border)]",
  ghost:
    "bg-transparent shadow-[0_0_0_1px_transparent] group-hover:bg-hover group-hover:shadow-[0_0_0_1px_var(--hover)] group-active:bg-active group-active:shadow-[0_0_0_0px_var(--active)]",
  destructive:
    "[--btn-bg:var(--destructive,#ef4444)] group-hover:[--btn-bg:color-mix(in_oklab,var(--destructive,#ef4444)_90%,black)] group-active:[--btn-bg:color-mix(in_oklab,var(--destructive,#ef4444)_80%,black)] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  link: "bg-transparent shadow-none",
};

/* 强制激活（`active` prop）：全尺寸下的按下配色；几何按压收缩仍然在其上响应。 */
export const activeBgVariants: Record<ButtonVariant, string> = {
  default:
    "[--btn-bg:color-mix(in_oklab,var(--foreground)_80%,var(--background))] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  primary:
    "[--btn-bg:color-mix(in_oklab,var(--foreground)_80%,var(--background))] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  secondary:
    "[--btn-bg:var(--accent)] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  outline:
    "bg-active shadow-[0_0_0_1px_var(--border),inset_0_0_0_0px_var(--border)] group-active:shadow-[0_0_0_0px_var(--border),inset_0_0_0_1px_var(--border)]",
  tertiary:
    "bg-active shadow-[0_0_0_1px_var(--border),inset_0_0_0_0px_var(--border)] group-active:shadow-[0_0_0_0px_var(--border),inset_0_0_0_1px_var(--border)]",
  ghost:
    "bg-active shadow-[0_0_0_1px_var(--active)] group-active:shadow-[0_0_0_0px_var(--active)]",
  destructive:
    "[--btn-bg:color-mix(in_oklab,var(--destructive,#ef4444)_80%,black)] bg-[var(--btn-bg)] shadow-[0_0_0_1px_var(--btn-bg)] group-active:shadow-[0_0_0_0px_var(--btn-bg)]",
  link: "bg-transparent shadow-none",
};
