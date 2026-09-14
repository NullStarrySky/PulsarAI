import { host } from "@/host";

export type RuntimePlatform =
	| "windows"
	| "macos"
	| "linux"
	| "android"
	| "ios"
	| "unknown";

let mobilePlatformOverride: boolean | null = null;

export function getRuntimePlatform(): RuntimePlatform {
	try {
		return host.platform.platform() as RuntimePlatform;
	} catch {
		return "unknown";
	}
}

export function isAndroidPlatform(): boolean {
	return getRuntimePlatform() === "android";
}

export function isMobilePlatform(): boolean {
	return mobilePlatformOverride ?? isNativeMobilePlatform();
}

export function isNativeMobilePlatform(): boolean {
	return host.platform.isMobile;
}

export function setMobilePlatformOverride(value: boolean | null): void {
	mobilePlatformOverride = value;
}

export function getMobilePlatformOverride(): boolean | null {
	return mobilePlatformOverride;
}
