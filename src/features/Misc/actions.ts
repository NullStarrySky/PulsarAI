import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Smartphone } from "lucide-vue-next";
import { useCommandStore } from "@/features/Hotkey/application/command-store";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useResponsiveStore } from "./application/responsive-store";

const mobilePreviewSize = new LogicalSize(390, 780);
const fallbackDesktopSize = new LogicalSize(970, 600);

let registered = false;
let desktopSizeBeforePreview: LogicalSize | null = null;

export function registerMiscCommands() {
  if (registered) {
    return;
  }
  registered = true;

  useCommandStore().registerCommand({
    id: "misc.mobile-preview.toggle",
    title: "切换移动端预览",
    description: "临时切换移动端 API 结果并调整当前窗口尺寸",
    category: "开发",
    defaultHotkey: "Ctrl+Shift+M",
    icon: Smartphone,
    run: toggleMobilePreview,
  });
}

async function toggleMobilePreview() {
  const responsive = useResponsiveStore();
  const layout = useLayoutStore();
  const appWindow = getCurrentWindow();
  const enabling = !responsive.mobilePreviewEnabled;

  if (enabling) {
    const [physicalSize, scaleFactor] = await Promise.all([
      appWindow.innerSize(),
      appWindow.scaleFactor(),
    ]);
    desktopSizeBeforePreview = physicalSize.toLogical(scaleFactor);
    await appWindow.unmaximize();
    responsive.setMobilePreview(true);
    layout.closeSidebars();
    await appWindow.setSize(mobilePreviewSize);
    await appWindow.center();
    return;
  }

  responsive.setMobilePreview(false);
  await appWindow.setSize(desktopSizeBeforePreview ?? fallbackDesktopSize);
  await appWindow.center();
  desktopSizeBeforePreview = null;
}
