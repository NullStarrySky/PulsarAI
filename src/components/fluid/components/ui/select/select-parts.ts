// 纯展示性的辅助部件。reka 自己的 SelectGroup/SelectLabel 有使用限制，
// 这里提供无约束的版本。
import { defineComponent, h } from "vue";
import { cn } from "../../../lib/utils";
import { useSize } from "../../../lib/size-context";

export const SelectGroup = defineComponent({
  name: "SelectGroup",
  setup(_, { attrs, slots }) {
    return () => h("div", { ...attrs, role: "group" }, slots.default?.());
  },
});

export const SelectLabel = defineComponent({
  name: "SelectLabel",
  setup(_, { attrs, slots }) {
    // 分组标签是类型阶梯的 caption 角色——见 /docs/sizes。
    const sizeClasses = useSize();
    return () =>
      h(
        "div",
        {
          ...attrs,
          class: cn(
            "shrink-0 px-2 py-1.5 text-muted-foreground",
            sizeClasses.value.variant === "compact" ? "text-[11px]" : "text-[12px]",
            attrs.class
          ),
        },
        slots.default?.()
      );
  },
});

export const SelectSeparator = defineComponent({
  name: "SelectSeparator",
  setup(_, { attrs }) {
    return () =>
      h("div", {
        ...attrs,
        role: "separator",
        class: cn("-mx-1 my-1 h-px shrink-0 bg-border/60", attrs.class),
      });
  },
});
