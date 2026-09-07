<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { cn } from "../../../lib/utils";
import { useShape } from "../../../lib/shape-context";
import { provideSize, useSize, type SizeVariant } from "../../../lib/size-context";
import { useSurface, provideSurface } from "../../../lib/surface-context";
import { surfaceClasses } from "../../../lib/surface-classes";
import { useIcon } from "../../../lib/icon-context";
import Slider from "../slider/Slider.vue";
import type { SliderValue } from "../slider/SliderCompact.vue";
import Tooltip from "../tooltip/Tooltip.vue";
import SaturationSquare from "./SaturationSquare.vue";
import FormatDropdown from "./FormatDropdown.vue";
import ColorInput from "./ColorInput.vue";
import {
  clamp01,
  hsvToRgb,
  rgbToHsv,
  rgbToHsl,
  hslToRgb,
  rgbToOklch,
  oklchToRgb,
  rgbToHexStr,
  parseColor,
  resolveCssColor,
  buildParsed,
  formatValueByFormat,
  type ColorFormat,
  type ParsedColor,
} from "./color-math";

// ─── ColorPicker（面板）────────────────────────────────────────────────
// HSV 为规范内部状态（H 在 S=0 / V=0 时保留）。sticky OKLCH 色相：
// 保住用户声明过的 OKLCH H 不在 RGB 往返中漂移。表面层级提升到
// max(substrate, 3)，并通过 SurfaceProvider 提供给后代（格式下拉等）。

const props = withDefaults(
  defineProps<{
    value?: string;
    defaultValue?: string;
    format?: ColorFormat;
    defaultFormat?: ColorFormat;
    swatches?: string[];
    hideEyedropper?: boolean;
    /** 把整个面板钉在尺寸阶梯的某一档。省略时跟随外围 SizeProvider。 */
    size?: SizeVariant;
    class?: string;
  }>(),
  { defaultValue: "#6B97FF", defaultFormat: "hex" }
);

const emit = defineEmits<{
  (e: "update:value", value: string, parsed: ParsedColor): void;
  (e: "update:format", format: ColorFormat): void;
}>();

defineOptions({ name: "ColorPicker" });

const PANEL_WIDTH = 280;
const CHECKER_BG: CSSProperties = {
  backgroundImage:
    "conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%, var(--checker-a) 0 75%, var(--checker-b) 0)",
  backgroundSize: "8px 8px",
};

const valuePassed = computed(() => props.value !== undefined);
const internalValue = ref(props.value ?? props.defaultValue);
const currentRawValue = computed(() =>
  valuePassed.value ? (props.value as string) : internalValue.value
);

const formatPassed = computed(() => props.format !== undefined);
const internalFormat = ref<ColorFormat>(props.defaultFormat);
const currentFormat = computed(() =>
  formatPassed.value ? (props.format as ColorFormat) : internalFormat.value
);

// 规范 HSV 状态。刻意只从初始值计算一次。
const initialHsv = (() => {
  const p = parseColor(currentRawValue.value);
  if (!p) return { h: 0, s: 1, v: 1, a: 1 };
  const hsv = rgbToHsv(p.r, p.g, p.b);
  return { h: hsv.s === 0 ? 0 : hsv.h, s: hsv.s, v: hsv.v, a: p.a };
})();
const hsv = ref(initialHsv);

// sticky OKLCH 色相：跨有损 RGB 往返与消色差颜色保留用户声明的 H；
// 通过任何非 OKLCH 内部通道改色时清除。
let oklchHue: number | null = null;

// 外部受控值变化 → 同步 HSV
let lastEmitted = "";
watch(
  [() => props.value, valuePassed],
  ([val, passed]) => {
    if (!passed) return;
    if (val === lastEmitted) return;
    const p = parseColor(val ?? "");
    if (!p) return;
    oklchHue = null;
    const newHsv = rgbToHsv(p.r, p.g, p.b);
    hsv.value = {
      h: newHsv.s === 0 ? hsv.value.h : newHsv.h,
      s: newHsv.s,
      v: newHsv.v,
      a: p.a,
    };
  },
  { immediate: false }
);

const parsed = computed(() => buildParsed(hsv.value.h, hsv.value.s, hsv.value.v, hsv.value.a));

function updateHsv(next: Partial<typeof hsv.value>) {
  const merged = { ...hsv.value, ...next };
  hsv.value = merged;
  const p = buildParsed(merged.h, merged.s, merged.v, merged.a);
  const formatted = formatValueByFormat(p, currentFormat.value);
  lastEmitted = formatted;
  if (!valuePassed.value) internalValue.value = formatted;
  emit("update:value", formatted, p);
}

function handleFormatChange(f: ColorFormat) {
  if (!formatPassed.value) internalFormat.value = f;
  emit("update:format", f);
  // 以新格式重新发值
  const formatted = formatValueByFormat(parsed.value, f);
  lastEmitted = formatted;
  if (!valuePassed.value) internalValue.value = formatted;
  emit("update:value", formatted, parsed.value);
}

function handleHexCommit(input: string) {
  // resolveCssColor 兜底命名 CSS 颜色（"red"、"tomato"）。
  const p = resolveCssColor(input);
  if (!p) return;
  oklchHue = null;
  const newHsv = rgbToHsv(p.r, p.g, p.b);
  const merged = {
    h: newHsv.s === 0 ? hsv.value.h : newHsv.h,
    s: newHsv.s,
    v: newHsv.v,
    a: p.a,
  };
  hsv.value = merged;
  const next = buildParsed(merged.h, merged.s, merged.v, merged.a);
  const formatted = formatValueByFormat(next, currentFormat.value);
  lastEmitted = formatted;
  if (!valuePassed.value) internalValue.value = formatted;
  emit("update:value", formatted, next);
}

const solidRgb = computed(() => hsvToRgb(hsv.value.h, hsv.value.s, hsv.value.v));
const solidR = computed(() => Math.round(solidRgb.value.r));
const solidG = computed(() => Math.round(solidRgb.value.g));
const solidB = computed(() => Math.round(solidRgb.value.b));
const solidColorString = computed(
  () => `rgb(${solidR.value}, ${solidG.value}, ${solidB.value})`
);

const substrate = useSurface();
const pickerLevel = computed(() => Math.max(substrate.value, 3));
provideSurface(pickerLevel);

const shape = useShape();
const sizeClasses = useSize(() => props.size);

// size prop 把整个面板——格式下拉、输入框、取色器——钉在一档。
provideSize({ size: () => props.size });

// ── 通道编辑（按格式）─────────────────────────────────────
function handleChannelChange(key: string, value: string) {
  const p = { ...parsed.value };
  switch (key) {
    case "hex":
      handleHexCommit(value.startsWith("#") ? value : `#${value}`);
      return;
    case "r":
    case "g":
    case "b": {
      oklchHue = null;
      const r = key === "r" ? Number(value) : p.r;
      const g = key === "g" ? Number(value) : p.g;
      const b = key === "b" ? Number(value) : p.b;
      const hsvVal = rgbToHsv(r, g, b);
      updateHsv({
        h: hsvVal.s === 0 ? hsv.value.h : hsvVal.h,
        s: hsvVal.s,
        v: hsvVal.v,
      });
      return;
    }
    case "hSL":
    case "sSL":
    case "lSL": {
      if (key === "hSL") oklchHue = null;
      const hsl = rgbToHsl(p.r, p.g, p.b);
      const h2 = key === "hSL" ? Number(value) : hsl.h;
      const s2 = key === "sSL" ? Number(value) / 100 : hsl.s;
      const l2 = key === "lSL" ? Number(value) / 100 : hsl.l;
      const rgb = hslToRgb(h2, clamp01(s2), clamp01(l2));
      const hsvVal = rgbToHsv(rgb.r, rgb.g, rgb.b);
      updateHsv({
        h: hsvVal.s === 0 ? h2 : hsvVal.h,
        s: hsvVal.s,
        v: hsvVal.v,
      });
      return;
    }
    case "L":
    case "C":
    case "H": {
      const cur = rgbToOklch(p.r, p.g, p.b);
      // L/C 编辑锚定用户最后一次声明的 H，不随 chroma 变化漂移。
      const baseH = oklchHue ?? cur.H;
      const L = key === "L" ? Number(value) / 100 : cur.L;
      const C = key === "C" ? Number(value) : cur.C;
      const H = key === "H" ? Number(value) : baseH;
      oklchHue = H;
      const rgb = oklchToRgb(clamp01(L), Math.max(0, C), H);
      const hsvVal = rgbToHsv(rgb.r, rgb.g, rgb.b);
      updateHsv({
        h: hsvVal.s === 0 ? hsv.value.h : hsvVal.h,
        s: hsvVal.s,
        v: hsvVal.v,
      });
      return;
    }
    case "alphaPercent": {
      const a = clamp01(Number(value) / 100);
      updateHsv({ a });
      return;
    }
  }
}

// ── 取色器（EyeDropper）───────────────────────────────────
const PipetteIcon = useIcon("pipette");
const eyeDropperSupported = typeof window !== "undefined" && "EyeDropper" in window;

async function handleEyedrop() {
  try {
    const Ctor = (window as any).EyeDropper;
    const eye = new Ctor();
    const result = await eye.open();
    handleHexCommit(result.sRGBHex);
  } catch {
    // 用户取消
  }
}

function handleHueSlider(v: SliderValue) {
  const h = Array.isArray(v) ? (v[0] ?? 0) : v;
  updateHsv({ h });
}

function handleAlphaSlider(v: SliderValue) {
  const raw = Array.isArray(v) ? (v[0] ?? 0) : v;
  updateHsv({ a: raw / 100 });
}

// ── 色板（Swatches）───────────────────────────────────────
const resolvedSwatches = ref<Record<string, string>>({});
watch(
  () => props.swatches,
  (swatches) => {
    if (!swatches) return;
    const next: Record<string, string> = {};
    for (const sw of swatches) {
      if (!parseColor(sw)) {
        const p = resolveCssColor(sw);
        if (p) next[sw] = rgbToHexStr(p.r, p.g, p.b, p.a).toLowerCase();
      }
    }
    resolvedSwatches.value = next;
  },
  { immediate: true }
);

const normalizedCurrent = computed(() => {
  const p = parseColor(parsed.value.hex);
  return p ? rgbToHexStr(p.r, p.g, p.b, p.a).toLowerCase() : "";
});

function swatchNormalized(sw: string): string {
  const parsed2 = parseColor(sw);
  return parsed2
    ? rgbToHexStr(parsed2.r, parsed2.g, parsed2.b, parsed2.a).toLowerCase()
    : (resolvedSwatches.value[sw] ?? sw.toLowerCase());
}

const swatchRing = (selected: boolean, hovered: boolean) =>
  selected
    ? "inset 0 0 0 1px rgba(127,127,127,0.25), 0 0 0 2px var(--background), 0 0 0 4px #6B97FF"
    : hovered
      ? "inset 0 0 0 1px rgba(127,127,127,0.25), 0 0 0 2px var(--background), 0 0 0 4px rgba(127,127,127,0.4)"
      : "inset 0 0 0 1px rgba(127,127,127,0.25)";

// ── 通道行数据（按格式）───────────────────────────────────
const alphaPct = computed(() => Math.round(parsed.value.a * 100));

const hexNoHash = computed(() => parsed.value.hex.replace(/^#/, "").toUpperCase());
const hslChannels = computed(() => rgbToHsl(parsed.value.r, parsed.value.g, parsed.value.b));
const oklchChannels = computed(() => rgbToOklch(parsed.value.r, parsed.value.g, parsed.value.b));
const oklchDisplayH = computed(() => oklchHue ?? oklchChannels.value.H);

interface ChannelField {
  key: string;
  label: string;
  value: string;
  prefix?: string;
  inputMode?: "numeric" | "decimal" | "text";
  nudgeStep?: number;
  nudgeShiftStep?: number;
  decimals?: number;
  min?: number;
  max?: number;
  wrap?: boolean;
  hasPercent?: boolean;
}

const channelFields = computed<ChannelField[]>(() => {
  if (currentFormat.value === "hex") {
    return [
      {
        key: "hex",
        label: "Hex",
        value: hexNoHash.value,
        prefix: "#",
        inputMode: "text",
      },
    ];
  }
  if (currentFormat.value === "rgb") {
    return [
      { key: "r", label: "红", value: String(parsed.value.r), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 255 },
      { key: "g", label: "绿", value: String(parsed.value.g), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 255 },
      { key: "b", label: "蓝", value: String(parsed.value.b), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 255 },
    ];
  }
  if (currentFormat.value === "hsl") {
    return [
      { key: "hSL", label: "色相", value: String(Math.round(hslChannels.value.h)), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 360, wrap: true },
      { key: "sSL", label: "饱和度", value: String(Math.round(hslChannels.value.s * 100)), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 100 },
      { key: "lSL", label: "亮度", value: String(Math.round(hslChannels.value.l * 100)), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 100 },
    ];
  }
  return [
    { key: "L", label: "明度", value: (oklchChannels.value.L * 100).toFixed(0), inputMode: "decimal", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 100 },
    { key: "C", label: "彩度", value: oklchChannels.value.C.toFixed(2), inputMode: "decimal", nudgeStep: 0.01, nudgeShiftStep: 0.1, decimals: 2, min: 0, max: 0.4 },
    { key: "H", label: "色相", value: oklchDisplayH.value.toFixed(0), inputMode: "numeric", nudgeStep: 1, nudgeShiftStep: 10, min: 0, max: 360, wrap: true },
  ];
});

const hueColor = computed(() => `hsl(${hsv.value.h}, 100%, 50%)`);

const panelClass = computed(() =>
  cn("flex flex-col gap-2 p-3", surfaceClasses(pickerLevel.value, 1), shape.value.container, props.class)
);
</script>

<template>
  <div :class="panelClass" :style="{ width: `${PANEL_WIDTH}px` }">
    <SaturationSquare
      :h="hsv.h"
      :s="hsv.s"
      :v="hsv.v"
      @change="(s: number, v: number) => updateHsv({ s, v })"
    />

    <div class="flex flex-col [&>*]:mb-0 [&>*+*]:-mt-px">
      <Slider
        :value="hsv.h"
        :min="0"
        :max="360"
        :step="1"
        :show-value="false"
        hide-fill
        :thumb-color="hueColor"
        thumb-border-color="rgba(255,255,255,0.9)"
        aria-label="色相"
        :track-style="{
          background:
            'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))',
          borderColor: 'transparent',
        }"
        @update:value="handleHueSlider"
      />
      <Slider
        :value="alphaPct"
        :min="0"
        :max="100"
        :step="1"
        :show-value="false"
        hide-fill
        :thumb-color="solidColorString"
        thumb-border-color="rgba(255,255,255,0.9)"
        aria-label="不透明度"
        :track-style="{
          backgroundImage: `linear-gradient(to right, rgba(${solidR}, ${solidG}, ${solidB}, 0) 0%, ${solidColorString} 98%), conic-gradient(var(--checker-a) 0 25%, var(--checker-b) 0 50%, var(--checker-a) 0 75%, var(--checker-b) 0)`,
          backgroundSize: '100% 100%, 8px 8px',
          borderWidth: 0,
        }"
        @update:value="handleAlphaSlider"
      />
    </div>

    <div class="grid grid-cols-2 gap-2">
      <FormatDropdown :value="currentFormat" @change="handleFormatChange" />
      <button
        v-if="!hideEyedropper && eyeDropperSupported"
        type="button"
        aria-label="从屏幕取色"
        :class="
          cn(
            'flex cursor-pointer items-center justify-center bg-transparent text-muted-foreground outline-none transition-colors duration-80 hover:bg-hover hover:text-foreground active:bg-active focus-visible:ring-1 focus-visible:ring-[color:var(--focus-ring,#6B97FF)]',
            sizeClasses.control,
            sizeClasses.px,
            shape.input
          )
        "
        @click="handleEyedrop"
      >
        <PipetteIcon :size="sizeClasses.icon" :stroke-width="1.5" />
      </button>
    </div>

    <!-- 通道行：hex 两列；rgb/hsl/oklch 四列 -->
    <div :class="currentFormat === 'hex' ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-4 gap-1'">
      <Tooltip
        v-for="field in channelFields"
        :key="field.key"
        :content="field.label"
        :delay-duration="300"
      >
        <ColorInput
          :value="field.value"
          :ariaLabel="field.label"
          :prefix="field.prefix"
          :input-mode="field.inputMode"
          :nudge-step="field.nudgeStep"
          :nudge-shift-step="field.nudgeShiftStep"
          :decimals="field.decimals"
          :min="field.min"
          :max="field.max"
          :wrap="field.wrap"
          :align="field.key === 'hex' ? 'left' : 'center'"
          :scrubbable="field.key !== 'hex'"
          @commit="(next: string) => handleChannelChange(field.key, next)"
        />
      </Tooltip>
      <Tooltip content="不透明度" :delay-duration="300">
        <ColorInput
          :value="`${alphaPct}%`"
          ariaLabel="不透明度"
          align="center"
          input-mode="numeric"
          :nudge-step="1"
          :nudge-shift-step="10"
          has-percent
          scrubbable
          :min="0"
          :max="100"
          @commit="
            (input: string) => {
              const n = parseFloat(input.replace('%', ''));
              if (!Number.isNaN(n)) handleChannelChange('alphaPercent', String(Math.max(0, Math.min(100, Math.round(n)))));
            }
          "
        />
      </Tooltip>
    </div>

    <!-- 色板 -->
    <div v-if="swatches && swatches.length > 0" class="flex flex-wrap gap-2">
      <button
        v-for="(sw, i) in swatches"
        :key="`${sw}-${i}`"
        type="button"
        :aria-label="`选择颜色 ${sw}`"
        :class="
          cn(
            'relative shrink-0 cursor-pointer overflow-hidden outline-none transition-shadow duration-100',
            shape.bg
          )
        "
        :style="{
          width: '28px',
          height: '28px',
          ...CHECKER_BG,
          boxShadow: swatchRing(swatchNormalized(sw) === normalizedCurrent, false),
        }"
        @mouseenter="
          ($event.currentTarget as HTMLElement).style.boxShadow = swatchRing(
            swatchNormalized(sw) === normalizedCurrent,
            true
          )
        "
        @mouseleave="
          ($event.currentTarget as HTMLElement).style.boxShadow = swatchRing(
            swatchNormalized(sw) === normalizedCurrent,
            false
          )
        "
        @click="handleHexCommit(sw)"
      >
        <span class="absolute inset-0" :style="{ backgroundColor: sw }" />
      </button>
    </div>
  </div>
</template>
