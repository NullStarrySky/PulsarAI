import { host } from "@/host";

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
  const appWindow = host.desktop?.window;
  if (!appWindow || event.button !== 0 || event.buttons !== 1) return;
  const target = event.target;
  if (target instanceof Element && target.closest(interactiveSelector)) return;
  event.preventDefault();
  if (event.detail === 2) {
    void appWindow.toggleMaximize();
    return;
  }
  try {
    await appWindow.startDragging();
  } catch {
    // Native dragging can be cancelled when the pointer is released early.
  }
}
