import { isNativeMobilePlatform } from "@/features/Misc/domain/platform";

export {
  getSystemSttAvailability,
  getSystemSttPermission,
  listSystemSttLanguages,
  onSystemSttError,
  onSystemSttResult,
  requestSystemSttPermission,
  startSystemStt,
  stopSystemStt,
} from "../infrastructure/system-stt-client";

export const SYSTEM_STT_SERVICE_ID = "system-stt";

export function supportsSystemStt() {
  return isNativeMobilePlatform();
}
