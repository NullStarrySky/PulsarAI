import { host } from "@/host";

export type RuntimePlatform = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";
export type RuntimeOsType = RuntimePlatform;
export type RuntimeArch = string | "unknown";
export type RuntimeFamily = "windows" | "unix" | "unknown";

let mobilePlatformOverride: boolean | null = null;

export function getRuntimePlatform(): RuntimePlatform {
  try {
    return host.platform.platform() as RuntimePlatform;
  } catch {
    return "unknown";
  }
}

export function getRuntimeOsType(): RuntimeOsType {
  try {
    return host.platform.osType() as RuntimeOsType;
  } catch {
    return "unknown";
  }
}

export function getRuntimeArch(): RuntimeArch {
  try {
    return host.platform.arch();
  } catch {
    return "unknown";
  }
}

export function getRuntimeFamily(): RuntimeFamily {
  try {
    return host.platform.family() as RuntimeFamily;
  } catch {
    return "unknown";
  }
}

export function getRuntimeOsVersion() {
  try {
    return host.platform.version();
  } catch {
    return "unknown";
  }
}

export function isAndroidPlatform() {
  return getRuntimePlatform() === "android";
}

export function isIosPlatform() {
  return getRuntimePlatform() === "ios";
}

export function isMobilePlatform() {
  return mobilePlatformOverride ?? isNativeMobilePlatform();
}

export function isDesktopPlatform() {
  return !isMobilePlatform() && ["windows", "macos", "linux"].includes(getRuntimePlatform());
}

export function isNativeMobilePlatform() {
  return host.platform.isMobile;
}

export function setMobilePlatformOverride(value: boolean | null) {
  mobilePlatformOverride = value;
}

export function getMobilePlatformOverride() {
  return mobilePlatformOverride;
}
