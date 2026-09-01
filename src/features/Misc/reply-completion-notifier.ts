import { host } from "@/host";

export async function ensureNotificationPermission() {
	const granted = await host.notifications.isPermissionGranted();
	if (granted) {
		return true;
	}
	return (await host.notifications.requestPermission()) === "granted";
}
