// Adapted from Lina by SameerJS6 (https://lina.sameer.sh) — use-has-primary-touch.
// 检测触控为主的设备（粗指针 + 触点），在指针模式与媒体查询变化时实时更新。
// 首次渲染返回 false，因此非触控分支是水合稳定的默认值。

import { ref, onUnmounted, type Ref } from "vue";

export function useTouchPrimary(): Ref<boolean> {
  const isTouchPrimary = ref(false);

  const controller = new AbortController();
  const { signal } = controller;

  const handleTouch = () => {
    if (typeof window === "undefined") return;
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const prefersTouch = window.matchMedia("(pointer: coarse)").matches;
    isTouchPrimary.value = hasTouch && prefersTouch;
  };

  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", handleTouch, { signal });
  window.addEventListener("pointerdown", handleTouch, { signal });

  handleTouch();

  onUnmounted(() => controller.abort());

  return isTouchPrimary;
}
