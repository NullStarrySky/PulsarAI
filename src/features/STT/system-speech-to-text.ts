import { isNativeMobilePlatform } from "@/features/Misc/platform";

export {
	getSystemSttAvailability,
	getSystemSttPermission,
	onSystemSttError,
	onSystemSttResult,
	requestSystemSttPermission,
	startSystemStt,
	stopSystemStt,
} from "./providers/system-stt-client";

export const SYSTEM_STT_SERVICE_ID = "system-stt";

export function supportsSystemStt() {
	return isNativeMobilePlatform();
}
