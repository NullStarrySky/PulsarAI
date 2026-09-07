// Slider 的值显示（可点击编辑）与跟随缩略块的 tooltip 值。
import { defineComponent, h, ref, watch, type PropType } from "vue";
import { motion, useTransform } from "motion-v";
import { cn } from "../../../lib/utils";
import { fontWeights } from "../../../lib/font-weight";
import { useShape } from "../../../lib/shape-context";
import { spring } from "../../../lib/springs";
import { THUMB_SIZE, nearestStepIndex } from "./slider-engine";

export const ValueDisplay = defineComponent({
  name: "SliderValueDisplay",
  props: {
    values: { type: Array as () => number[], required: true },
    editingIndex: { type: Number as PropType<number | null>, default: null },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, required: true },
    stepValues: { type: Array as () => number[] | null, default: null },
    formatValue: { type: Function as unknown as PropType<(v: number) => string>, required: true },
    label: { type: String, required: false },
    isRange: { type: Boolean, default: false },
    isInteracting: { type: Boolean, default: false },
  },
  emits: ["start-edit", "commit-edit", "cancel-edit"],
  setup(p, { emit }) {
    const shape = useShape();
    const inputValue = ref("");
    const inputRef = ref<HTMLInputElement | null>(null);

    watch(
      () => p.editingIndex,
      (idx) => {
        if (idx !== null) {
          inputValue.value = String(p.values[idx]);
          requestAnimationFrame(() => inputRef.value?.select());
        }
      }
    );

    function commitEdit(index: number) {
      const parsed = parseFloat(inputValue.value);
      if (!isNaN(parsed)) {
        const clamped = Math.max(p.min, Math.min(p.max, parsed));
        const snapped = p.stepValues
          ? p.stepValues[nearestStepIndex(clamped, p.stepValues)]
          : Math.round((clamped - p.min) / p.step) * p.step + p.min;
        emit("commit-edit", index, snapped);
      } else {
        emit("cancel-edit");
      }
    }

    return () => {
      const widestValue = p.isRange
        ? `${p.label ? `${p.label}: ` : ""}${p.formatValue(p.max)} — ${p.formatValue(p.max)}`
        : `${p.label ? `${p.label}: ` : ""}${p.formatValue(p.max)}`;

      const renderValue = (index: number) => {
        if (p.editingIndex === index) {
          return h("span", { class: "inline-grid text-[13px]" }, [
            // 为布局稳定性保留 ghost——最宽的可能值
            h(
              "span",
              {
                class: "col-start-1 row-start-1 invisible",
                style: { fontVariationSettings: fontWeights.medium },
                "aria-hidden": "true",
              },
              `${p.label ? `${p.label}: ` : ""}${p.formatValue(p.max)}`
            ),
            h("span", { class: "col-start-1 row-start-1 flex items-center gap-1" }, [
              p.label ? h("span", { class: "text-muted-foreground" }, `${p.label}:`) : null,
              h("input", {
                ref: inputRef,
                type: "number",
                value: inputValue.value,
                min: p.min,
                max: p.max,
                step: p.stepValues ? "any" : p.step,
                onInput: (e: Event) => {
                  inputValue.value = (e.target as HTMLInputElement).value;
                },
                onBlur: () => commitEdit(index),
                onKeydown: (e: KeyboardEvent) => {
                  if (e.key === "Enter") commitEdit(index);
                  if (e.key === "Escape") emit("cancel-edit");
                },
                "aria-label": `Edit slider value${
                  p.isRange ? (index === 0 ? " (start)" : " (end)") : ""
                }`,
                class: cn(
                  "w-[5ch] border-b border-border bg-transparent text-center text-foreground outline-none",
                  shape.value.input
                ),
                style: { fontVariationSettings: fontWeights.medium },
              }),
            ]),
          ]);
        }
        return h(
          "span",
          {
            class: "cursor-text select-none",
            onClick: () => emit("start-edit", index),
          },
          p.formatValue(p.values[index])
        );
      };

      return h(
        "span",
        {
          class: cn(
            "inline-grid shrink-0 text-[13px] leading-none text-muted-foreground transition-[font-variation-settings] duration-100",
            "tabular-nums"
          ),
          style: {
            fontVariationSettings: p.isInteracting ? fontWeights.medium : fontWeights.normal,
          },
        },
        [
          // 不可见 ghost——保留最宽可能值的宽度
          h(
            "span",
            {
              class: "col-start-1 row-start-1 invisible whitespace-nowrap",
              style: { fontVariationSettings: fontWeights.medium },
              "aria-hidden": "true",
            },
            widestValue
          ),
          h("span", { class: "col-start-1 row-start-1 whitespace-nowrap" }, [
            p.label && p.editingIndex === null
              ? h("span", { class: "text-muted-foreground" }, `${p.label}: `)
              : null,
            p.isRange
              ? [
                  renderValue(0),
                  h("span", { class: "mx-1 text-muted-foreground/50" }, "—"),
                  renderValue(1),
                ]
              : renderValue(0),
          ]),
        ]
      );
    };
  },
});

export const TooltipValue = defineComponent({
  name: "SliderTooltipValue",
  props: {
    value: { type: Number, required: true },
    formatValue: { type: Function as unknown as PropType<(v: number) => string>, required: true },
    /** motion-v 的 MotionValue 直接传入。 */
    motionX: { type: Object as unknown as PropType<{ get: () => number }>, required: true },
  },
  setup(p) {
    const shape = useShape();
    const tooltipX = useTransform(p.motionX as never, (x: number) => x + THUMB_SIZE / 2);
    return () =>
      h(
        motion.div,
        {
          class: "pointer-events-none absolute z-20 -translate-x-1/2",
          style: { x: tooltipX as never, top: "-16px" },
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: 4, transition: spring.fast.exit },
          transition: spring.fast,
        },
        [
          h(
            "span",
            {
              class: cn(
                "whitespace-nowrap bg-foreground px-2 py-1 text-[12px] tabular-nums text-background",
                shape.value.bg
              ),
              style: { fontVariationSettings: fontWeights.medium },
            },
            p.formatValue(p.value)
          ),
        ]
      );
  },
});
