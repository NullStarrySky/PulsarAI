import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = isTauri() ? getCurrentWindow() : null;
const interactiveSelector = [
  "button",
  "input",
  "textarea",
  "select",
  "a",
  "[role='button']",
  "[role='menuitem']",
  "[contenteditable='true']",
  "[data-window-drag-block]",
].join(",");

export async function startWindowDragFromBackground(event: MouseEvent) {
  if (!appWindow || event.button !== 0 || event.buttons !== 1) return;
  const target = event.target;
  if (target instanceof Element && target.closest(interactiveSelector)) return;
  event.preventDefault();
  if (event.detail === 2) {
    void appWindow.toggleMaximize();
    return;
  }
  document.documentElement.classList.add("native-window-dragging");
  void document.documentElement.offsetWidth;
  try {
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    }
    await appWindow.startDragging();
  } catch {
    // Native dragging can be cancelled when the pointer is released early.
  } finally {
    document.documentElement.classList.remove("native-window-dragging");
  }
}
