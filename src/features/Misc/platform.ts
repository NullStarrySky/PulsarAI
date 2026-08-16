import {
  arch,
  family,
  platform,
  type Arch,
  type Family,
  type Platform,
  type OsType,
  type as osType,
  version,
} from "@tauri-apps/plugin-os";

export type RuntimePlatform = Platform | "unknown";
export type RuntimeOsType = OsType | "unknown";
export type RuntimeArch = Arch | "unknown";
export type RuntimeFamily = Family | "unknown";

let mobilePlatformOverride: boolean | null = null;

export function getRuntimePlatform(): RuntimePlatform {
  try {
    return platform();
  } catch {
    return "unknown";
  }
}

export function getRuntimeOsType(): RuntimeOsType {
  try {
    return osType();
  } catch {
    return "unknown";
  }
}

export function getRuntimeArch(): RuntimeArch {
  try {
    return arch();
  } catch {
    return "unknown";
  }
}

export function getRuntimeFamily(): RuntimeFamily {
  try {
    return family();
  } catch {
    return "unknown";
  }
}

export function getRuntimeOsVersion() {
  try {
    return version();
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
  return isAndroidPlatform() || isIosPlatform();
}

export function setMobilePlatformOverride(value: boolean | null) {
  mobilePlatformOverride = value;
}

export function getMobilePlatformOverride() {
  return mobilePlatformOverride;
}
