import {
  checkBatteryOptimizationStatus,
  openBatterySettings,
  requestBatteryOptimizationExemption,
  type BatteryStatus,
} from "tauri-plugin-android-battery-optimization-api";
import { isAndroidPlatform } from "../domain/platform";

export type AndroidBatteryOptimizationStatus = BatteryStatus & {
  available: boolean;
};

export async function getAndroidBatteryOptimizationStatus(): Promise<AndroidBatteryOptimizationStatus> {
  if (!isAndroidPlatform()) {
    return {
      available: false,
      isOptimized: false,
      isIgnoringOptimizations: false,
    };
  }

  return {
    available: true,
    ...(await checkBatteryOptimizationStatus()),
  };
}

export async function requestAndroidBatteryOptimizationExemption() {
  if (isAndroidPlatform()) {
    await requestBatteryOptimizationExemption();
  }
}

export async function openAndroidBatteryOptimizationSettings() {
  if (isAndroidPlatform()) {
    await openBatterySettings();
  }
}
