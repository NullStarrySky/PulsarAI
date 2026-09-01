import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export interface RuntimePreferences {
	playSoundOnReplyComplete: boolean;
	notifyOnReplyComplete: boolean;
	replyCompletionOnlyWhenBackground: boolean;
}

const storageKey = "pulsarai:runtime-preferences:v1";
const fallback: RuntimePreferences = {
	playSoundOnReplyComplete: false,
	notifyOnReplyComplete: false,
	replyCompletionOnlyWhenBackground: true,
};

export const useRuntimePreferenceStore = defineStore(
	"runtime-preferences",
	() => {
		const preferences = ref<RuntimePreferences>(readPreferences());
		const playSoundOnReplyComplete = computed({
			get: () => preferences.value.playSoundOnReplyComplete,
			set: (value) => {
				preferences.value.playSoundOnReplyComplete = value;
			},
		});
		const notifyOnReplyComplete = computed({
			get: () => preferences.value.notifyOnReplyComplete,
			set: (value) => {
				preferences.value.notifyOnReplyComplete = value;
			},
		});
		const replyCompletionOnlyWhenBackground = computed({
			get: () => preferences.value.replyCompletionOnlyWhenBackground,
			set: (value) => {
				preferences.value.replyCompletionOnlyWhenBackground = value;
			},
		});

		watch(
			preferences,
			() => {
				localStorage.setItem(storageKey, JSON.stringify(preferences.value));
			},
			{ deep: true },
		);

		return {
			notifyOnReplyComplete,
			playSoundOnReplyComplete,
			preferences,
			replyCompletionOnlyWhenBackground,
		};
	},
);

function readPreferences(): RuntimePreferences {
	const raw = localStorage.getItem(storageKey);
	if (!raw) {
		return { ...fallback };
	}

	try {
		return { ...fallback, ...(JSON.parse(raw) as Partial<RuntimePreferences>) };
	} catch {
		return { ...fallback };
	}
}
