import { host } from "@/host";

export type MobileNavigationBarMode = "topbar" | "system" | "light" | "dark";

export async function syncMobileNavigationBar(
  mode: MobileNavigationBarMode,
  topBarIsDark: boolean,
) {
  if (!host.mobile) {
    return false;
  }

  const color = mode === "topbar" ? topBarIsDark ? "dark" : "light" : mode;
  return color === "system" ? false : host.mobile.navigationBar.setColor(color);
}
