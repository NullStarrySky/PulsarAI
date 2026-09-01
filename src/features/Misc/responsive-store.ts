import { useMediaQuery } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
	getMobilePlatformOverride,
	isMobilePlatform,
	setMobilePlatformOverride,
} from "./platform";

const mobileViewportQuery = "(max-width: 767px)";

export const useResponsiveStore = defineStore("responsive", () => {
	const narrowViewport = useMediaQuery(mobileViewportQuery);
	const platformMobile = ref(isMobilePlatform());
	const mobilePreviewEnabled = ref(getMobilePlatformOverride() === true);
	const isMobileLayout = computed(
		() => platformMobile.value || narrowViewport.value,
	);

	watch(
		isMobileLayout,
		(mobile) => {
			if (typeof document === "undefined") {
				return;
			}
			document.documentElement.classList.toggle("mobile-layout", mobile);
			document.documentElement.dataset.mobileLayout = String(mobile);
		},
		{ immediate: true },
	);

	function refreshPlatform() {
		platformMobile.value = isMobilePlatform();
	}

	function setMobilePreview(enabled: boolean) {
		setMobilePlatformOverride(enabled ? true : null);
		mobilePreviewEnabled.value = enabled;
		refreshPlatform();
	}

	return {
		narrowViewport,
		platformMobile,
		mobilePreviewEnabled,
		isMobileLayout,
		refreshPlatform,
		setMobilePreview,
	};
});
