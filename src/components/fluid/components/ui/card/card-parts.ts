import { defineComponent, h, type CSSProperties } from "vue";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { useSize } from "../../../lib/size-context";
import { useIcon, type IconComponent } from "../../../lib/icon-context";
import { useCardContext } from "./card-context";

// shadcn 的 header 网格：title + description 堆叠，CardAction 钉在右上列。
// 在 inline 卡片里它成为前导媒体与尾随 footer 之间的弹性文本列。
export const CardHeader = defineComponent({
  name: "CardHeader",
  setup(_, { attrs, slots }) {
    const { orientation, hasImage } = useCardContext();
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      const inlineImage = orientation === "inline" && hasImage.value;
      return h(
        "div",
        {
          ...attrs,
          "data-slot": "card-header",
          class: cn(
            "grid auto-rows-min items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
            inlineImage
              ? "min-w-0"
              : orientation === "inline"
                ? cn("min-w-0 flex-1", compact ? "py-2.5" : "py-3.5")
                : compact
                  ? "px-3 pt-3"
                  : "px-4 pt-4",
            attrs.class
          ),
        },
        slots.default?.()
      );
    };
  },
});

export const CardTitle = defineComponent({
  name: "CardTitle",
  setup(_, { attrs, slots }) {
    const { emphasized, orientation } = useCardContext();
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      // inline 行把标题 trim 到 cap 高度，与媒体/动作紧密居中；
      // 堆叠卡片保留自然行盒。
      const trim =
        orientation === "inline" ? "[text-box:trim-both_cap_alphabetic]" : "";
      // Ghost-span 模式：一份不可见的 semibold 拷贝占住宽度，
      // 让静止→激活的字重动画永远不回流行。
      const children = slots.default?.();
      return h(
        "span",
        {
          ...attrs,
          "data-slot": "card-title",
          class: cn(
            "inline-grid grid-cols-[minmax(0,1fr)] leading-snug",
            compact ? "text-[13px]" : "text-[14px]",
            attrs.class
          ),
        },
        [
          h(
            "span",
            {
              class: cn(
                "col-start-1 row-start-1 min-w-0 overflow-hidden text-ellipsis invisible",
                trim
              ),
              style: { fontVariationSettings: fontWeights.semibold },
              "aria-hidden": "true",
            },
            children
          ),
          h(
            "span",
            {
              class: cn(
                "col-start-1 row-start-1 min-w-0 overflow-hidden text-ellipsis text-foreground transition-[font-variation-settings] duration-80",
                trim
              ),
              style: {
                // normal → semibold（emphasis 时），与 nav-item / menu-item /
                // table 一致（opsz 配对 token 让 advance 宽度几乎不变）。
                fontVariationSettings: emphasized.value
                  ? fontWeights.semibold
                  : fontWeights.normal,
              },
            },
            children
          ),
        ]
      );
    };
  },
});

export const CardDescription = defineComponent({
  name: "CardDescription",
  setup(_, { attrs, slots }) {
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      return h(
        "p",
        {
          ...attrs,
          "data-slot": "card-description",
          class: cn(
            "leading-normal text-muted-foreground",
            compact ? "text-[13px]" : "text-[14px]",
            attrs.class
          ),
        },
        slots.default?.()
      );
    };
  },
});

// 钉在 header 的右上列（shadcn 的 slot）。位于拉伸 overlay 之上，
// 内部的任何控件保持独立可点击。
export const CardAction = defineComponent({
  name: "CardAction",
  setup(_, { attrs, slots }) {
    return () =>
      h(
        "div",
        {
          ...attrs,
          "data-slot": "card-action",
          class: cn(
            "relative z-30 col-start-2 row-span-2 row-start-1 self-start justify-self-end",
            attrs.class
          ),
        },
        slots.default?.()
      );
  },
});

export const CardContent = defineComponent({
  name: "CardContent",
  setup(_, { attrs, slots }) {
    const { orientation } = useCardContext();
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      return h("div", {
        ...attrs,
        "data-slot": "card-content",
        class: cn(
          orientation === "inline" ? "" : compact ? "px-3 pt-2.5" : "px-4 pt-3",
          attrs.class
        ),
      }, slots.default?.());
    };
  },
});

// 动作行。升到拉伸 overlay 之上（z-30）让按钮保持可点击。
// inline 卡片里它成为尾随的右对齐槽。
export const CardFooter = defineComponent({
  name: "CardFooter",
  setup(_, { attrs, slots }) {
    const { orientation, hasImage } = useCardContext();
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      const inlineImage = orientation === "inline" && hasImage.value;
      return h(
        "div",
        {
          ...attrs,
          "data-slot": "card-footer",
          class: cn(
            "relative z-30 flex items-center gap-1",
            inlineImage
              // 在文本下方，按自然顺序左对齐（inline wrapper 拥有间距）。
              ? "flex-wrap"
              : orientation === "inline"
                ? cn("ml-auto shrink-0", compact ? "pr-3" : "pr-4")
                : cn("flex-wrap", compact ? "px-3 pt-2.5" : "px-4 pt-3"),
            attrs.class
          ),
        },
        slots.default?.()
      );
    };
  },
});

export type CardLogo = string | [string, string];

// FF 附加：前导图标或品牌 logo。多数产品卡片需要的连接组织。
// 元组渲染一对相连的 logo（例如 trigger — target）。
export const CardMedia = defineComponent({
  name: "CardMedia",
  props: {
    logo: { type: [String, Array] as unknown as () => CardLogo, required: false },
    logoAlt: { type: String, required: false },
    icon: { type: Object as () => IconComponent, required: false },
    size: { type: Number, default: 22 },
  },
  setup(props, { attrs }) {
    const { orientation } = useCardContext();
    const shape = useShape();
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      // 堆叠：位于 header 网格内；下方间距读 12px（header gap-1 + mb-2）。
      // inline：前导槽——卡片拥有左侧缩进，这里不需要额外内边距。
      const wrap = cn(orientation === "inline" ? "" : "mb-2", attrs.class as string);

      if (props.logo) {
        const logos = Array.isArray(props.logo) ? props.logo : [props.logo];
        return h(
          "span",
          {
            "data-slot": "card-media",
            class: cn("inline-flex items-center gap-1.5 shrink-0", wrap),
          },
          logos.map((src, i) =>
            h("span", { key: i, class: "inline-flex items-center gap-1.5" }, [
              i > 0 && h("span", { "aria-hidden": "true", class: "h-px w-2 bg-border" }),
              h("img", {
                src,
                alt: props.logoAlt ?? "",
                width: props.size,
                height: props.size,
                class: cn("object-contain", shape.value.bg),
                style: { width: props.size, height: props.size },
              }),
            ])
          )
        );
      }
      if (props.icon) {
        const Icon = props.icon;
        // 图标坐在 32×32 的着色瓦片里，读作媒体槽而不是裸字形。
        // 瓦片是 overlay 染色（不是实心表面），能混入其后的任何东西
        // ——底面或悬停高亮。
        return h(
          "span",
          {
            "data-slot": "card-media",
            class: cn(
              "inline-flex items-center justify-center size-8 shrink-0 bg-hover",
              shape.value.bg,
              wrap
            ),
          },
          [
            h(Icon, {
              size: compact ? 16 : 18,
              strokeWidth: 1.5,
              class: "text-muted-foreground",
            }),
          ]
        );
      }
      return null;
    };
  },
});

// FF 附加：显眼的全出血图片（区别于小 logo）。
// 堆叠 → 顶部横幅；inline → 左侧全高前导图，出血越过卡片左缩进贴边。
export const CardImage = defineComponent({
  name: "CardImage",
  props: {
    src: { type: String, required: true },
    alt: { type: String, required: false },
  },
  setup(props, { attrs }) {
    const { orientation } = useCardContext();
    return () =>
      h("img", {
        src: props.src,
        alt: props.alt ?? "",
        "data-slot": "card-image",
        // 图片在任何状态下保持固定的 2px 圆角——堆叠或 inline、带框或无边框
        // ——而不是继承外框更大的裁剪。（带框瓦片仍照旧裁剪周围表面。）
        class: cn(
          "object-cover rounded-[2px]",
          orientation === "inline" ? "size-40 shrink-0" : "aspect-[16/9] w-full",
          attrs.class
        ),
      });
  },
});

// 标题上方的小型大写标签（例如 "New Model"）。
// 排版上是类型阶梯 caption 角色的大写形态——见 /docs/sizes。
export const CardEyebrow = defineComponent({
  name: "CardEyebrow",
  setup(_, { attrs }) {
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      return h("span", {
        ...attrs,
        "data-slot": "card-eyebrow",
        class: cn(
          compact ? "text-[11px]" : "text-[12px]",
          "uppercase tracking-wide text-muted-foreground",
          attrs.class
        ),
        style: {
          ...((attrs.style as CSSProperties) ?? {}),
          fontVariationSettings: fontWeights.semibold,
        },
      });
    };
  },
});

// FF 附加：图标 + 标题 + 描述行，用于 CardContent 内的功能列表。
export const CardFeature = defineComponent({
  name: "CardFeature",
  props: {
    icon: { type: Object as () => IconComponent, required: false },
    title: { type: String, required: true },
    description: { type: String, required: false },
  },
  setup(props) {
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      return h(
        "div",
        { "data-slot": "card-feature", class: cn("flex items-start", sizeClasses.value.gap) },
        [
          props.icon
            ? h(props.icon, {
                size: sizeClasses.value.icon,
                strokeWidth: 1.5,
                class: "mt-0.5 shrink-0 text-muted-foreground",
              })
            : null,
          h("div", { class: "flex min-w-0 flex-col gap-0.5" }, [
            h(
              "span",
              {
                class: cn(
                  "text-foreground [text-box:trim-both_cap_alphabetic]",
                  sizeClasses.value.text
                ),
                style: { fontVariationSettings: fontWeights.medium },
              },
              props.title
            ),
            props.description
              ? h(
                  "span",
                  {
                    class: cn(
                      "leading-relaxed text-muted-foreground",
                      compact ? "text-[11px]" : "text-[12px]"
                    ),
                  },
                  props.description
                )
              : null,
          ]),
        ]
      );
    };
  },
});

// footer 的自足动作按钮（让 Card 不依赖 Button，可独立安装）。
// 设置 `href` 时渲染锚点。
export type CardButtonVariant = "primary" | "secondary" | "ghost" | "link";

export const CARD_BUTTON_VARIANTS: Record<CardButtonVariant, string> = {
  primary: "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
  secondary: "bg-accent text-foreground hover:bg-accent/80 active:bg-accent",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-hover active:bg-active",
  link: "text-foreground underline-offset-4 hover:underline !px-0 !h-auto",
};

export const CardButton = defineComponent({
  name: "CardButton",
  props: {
    onClick: { type: Function, required: false },
    href: { type: String, required: false },
    variant: { type: String as () => CardButtonVariant, default: "ghost" },
    icon: { type: Object as () => IconComponent, required: false },
    iconPosition: { type: String as () => "start" | "end", required: false },
    /** 在新标签打开 href 并追加外向箭头字形。 */
    external: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const shape = useShape();
    const ArrowRight = useIcon("arrow-right");
    const sizeClasses = useSize();
    return () => {
      const compact = sizeClasses.value.variant === "compact";
      const position = props.iconPosition ?? (props.external ? "end" : "start");
      const children = slots.default?.();

      const glyph = props.icon
        ? h(props.icon, {
            size: compact ? 12 : 14,
            strokeWidth: 1.5,
            class: "shrink-0 transition-[stroke-width] duration-80 group-hover/action:stroke-[2]",
          })
        : null;
      const externalGlyph = props.external
        ? h(ArrowRight, {
            size: 13,
            strokeWidth: 1.5,
            class: "shrink-0 -rotate-45 transition-[stroke-width] duration-80 group-hover/action:stroke-[2]",
          })
        : null;

      const inner = [
        position === "start" ? glyph : null,
        h("span", { class: "[text-box:trim-both_cap_alphabetic]" }, children),
        position === "end" ? glyph : null,
        externalGlyph,
      ];

      const classes = cn(
        "group/action relative z-30 inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 px-2.5 outline-none",
        compact ? "text-[11px]" : "text-[12px]",
        "transition-colors duration-80",
        "focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]",
        "disabled:pointer-events-none disabled:opacity-50",
        shape.value.button,
        CARD_BUTTON_VARIANTS[props.variant]
      );

      if (props.href) {
        return h(
          "a",
          {
            href: props.href,
            onClick: props.onClick,
            target: props.external ? "_blank" : undefined,
            rel: props.external ? "noopener noreferrer" : undefined,
            class: classes,
            style: { fontVariationSettings: fontWeights.medium },
          },
          inner
        );
      }

      return h(
        "button",
        {
          type: "button",
          onClick: props.onClick,
          disabled: props.disabled,
          class: classes,
          style: { fontVariationSettings: fontWeights.medium },
        },
        inner
      );
    };
  },
});
