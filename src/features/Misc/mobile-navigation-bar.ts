import { isAndroidPlatform } from "./platform";

export type MobileNavigationBarMode = "topbar" | "system" | "light" | "dark";

export async function syncMobileNavigationBar(
  mode: MobileNavigationBarMode,
  topBarIsDark: boolean,
) {
  if (!isAndroidPlatform()) {
    return false;
  }

  try {
    const { M3 } = await import("tauri-plugin-m3");
    const color = mode === "topbar"
      ? topBarIsDark ? "dark" : "light"
      : mode;
    return Boolean(await M3.setBarColor(color));
  } catch {
    return false;
  }
}
