import { host } from "@/host";

export type RuntimePlatform =
	| "windows"
	| "macos"
	| "linux"
	| "android"
	| "ios"
	| "unknown";
let mobilePlatformOverride: boolean | null = null;

function getRuntimePlatform(): RuntimePlatform {
	try {
		return host.platform.platform() as RuntimePlatform;
	} catch {
		return "unknown";
	}
}

export function isAndroidPlatform() {
	return getRuntimePlatform() === "android";
}

export function isMobilePlatform() {
	return mobilePlatformOverride ?? isNativeMobilePlatform();
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
