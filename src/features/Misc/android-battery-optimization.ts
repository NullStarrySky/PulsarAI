import { host } from "@/host";

export type AndroidBatteryOptimizationStatus = {
	available: boolean;
	isOptimized: boolean;
	isIgnoringOptimizations: boolean;
};

export async function getAndroidBatteryOptimizationStatus(): Promise<AndroidBatteryOptimizationStatus> {
	if (!host.mobile) {
		return {
			available: false,
			isOptimized: false,
			isIgnoringOptimizations: false,
		};
	}

	return host.mobile.battery.getStatus();
}

export async function requestAndroidBatteryOptimizationExemption() {
	await host.mobile?.battery.requestExemption();
}

export async function openAndroidBatteryOptimizationSettings() {
	await host.mobile?.battery.openSettings();
}
