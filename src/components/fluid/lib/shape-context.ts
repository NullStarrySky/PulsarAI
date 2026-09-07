import {
  computed,
  inject,
  onUnmounted,
  provide,
  ref,
  watchEffect,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";

export type ShapeVariant = "pill" | "rounded" | "square";

export interface ShapeClasses {
  item: string;
  bg: string;
  focusRing: string;
  mergedBg: string;
  container: string;
  button: string;
  input: string;
  // `bg` / `mergedBg` 的数字对应值（px）。当需要逐角动画时（例如选中背景的
  // merge/split 动画），必须使用逐角的数字圆角而不是 class。
  bgRadius: number;
  mergedRadius: number;
}

export const shapeMap: Record<ShapeVariant, ShapeClasses> = {
  pill: {
    item: "rounded-[20px]",
    bg: "rounded-[20px]",
    // +2px over `item` because the focus ring sits 2px outside the element
    // (top/left -2, width/height +4); this keeps the corners concentric so a
    // pill element gets a pill ring (matches the rounded-mode 8px→10px bump).
    focusRing: "rounded-[22px]",
    mergedBg: "rounded-2xl",
    container: "rounded-3xl",
    button: "rounded-[20px]",
    input: "rounded-[20px]",
    bgRadius: 20,
    mergedRadius: 16,
  },
  rounded: {
    item: "rounded-lg",
    bg: "rounded-lg",
    focusRing: "rounded-[10px]",
    mergedBg: "rounded-lg",
    container: "rounded-xl",
    button: "rounded-lg",
    input: "rounded-lg",
    bgRadius: 8,
    mergedRadius: 8,
  },
  square: {
    item: "rounded-none",
    bg: "rounded-none",
    focusRing: "rounded-none",
    mergedBg: "rounded-none",
    container: "rounded-none",
    button: "rounded-none",
    input: "rounded-none",
    bgRadius: 0,
    mergedRadius: 0,
  },
};

export interface ShapeContextValue {
  shape: Ref<ShapeVariant>;
  setShape: (shape: ShapeVariant) => void;
  classes: ComputedRef<ShapeClasses>;
}

const ShapeKey: InjectionKey<ShapeContextValue> = Symbol("fluid-shape");

const pillClasses = computed(() => shapeMap.pill);

/**
 * 当前形状的 class 集合；无 Provider 时回退 pill。
 */
export function useShape(): ComputedRef<ShapeClasses> {
  const ctx = inject(ShapeKey, null);
  if (!ctx) return pillClasses;
  return ctx.classes;
}

export function useShapeContext(): ShapeContextValue {
  const ctx = inject(ShapeKey, null);
  if (!ctx) throw new Error("useShapeContext must be used within a ShapeProvider");
  return ctx;
}

export function provideShape(defaultShape: ShapeVariant = "pill"): ShapeContextValue {
  const shape = ref<ShapeVariant>(defaultShape);
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

  // Run a state change under the `.transitioning` guard (added + reflow-flushed
  // first so the 180ms border-radius cross-fade applies). Clearing the previous
  // timeout first keeps a double-press from removing the class mid-fade.
  function transitionShape(callback: () => void) {
    const root = document.documentElement;
    root.classList.add("transitioning");
    void root.offsetHeight;
    callback();
    if (transitionTimeout) clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => root.classList.remove("transitioning"), 200);
  }

  function setShape(next: ShapeVariant) {
    transitionShape(() => {
      shape.value = next;
    });
  }

  // Publish the current element radius as a CSS custom property so plain-CSS
  // consumers that can't read context stay in sync with the shape system —
  // e.g. the @layer base :focus-visible fallback ring. Set on <html> so
  // portalled content sees it too.
  watchEffect(() => {
    document.documentElement.style.setProperty(
      "--shape-input-radius",
      `${shapeMap[shape.value].bgRadius}px`
    );
    document.documentElement.style.setProperty(
      "--radius",
      shape.value === "pill" ? "1.25rem" : shape.value === "rounded" ? "0.625rem" : "0rem"
    );
  });

  onUnmounted(() => {
    if (transitionTimeout) clearTimeout(transitionTimeout);
  });

  const value: ShapeContextValue = {
    shape,
    setShape,
    classes: computed(() => shapeMap[shape.value]),
  };
  provide(ShapeKey, value);
  return value;
}
