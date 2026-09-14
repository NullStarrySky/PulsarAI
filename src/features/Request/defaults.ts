import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { host } from "@/host";
import type { ModelSelection } from "./types";

export interface DefaultRequestSettings {
	defaultChatModel: ModelSelection;
	fastModel: ModelSelection;
	imageModel: ModelSelection | null;
	speechModel: ModelSelection | null;
	transcriptionModel: ModelSelection | null;
}

export function getDefaultRequestSettings(): DefaultRequestSettings {
	return {
		defaultChatModel: {
			providerId: "openai",
			modelId: "gpt-4o-mini",
			kind: "text",
		},
		fastModel: { providerId: "openai", modelId: "gpt-4o-mini", kind: "text" },
		imageModel: null,
		speechModel: {
			providerId: "edge-tts",
			modelId: "edge-tts",
			kind: "speech",
		},
		transcriptionModel: null,
	};
}

export const useRequestDefaults = defineStore("request-defaults", () => {
	const defaults = ref<DefaultRequestSettings>(getDefaultRequestSettings());
	let loaded = false;

	watch(defaults, () => void host.config.set("defaults", defaults.value), {
		deep: true,
	});

	async function initialize() {
		if (loaded) return;
		const stored = await host.config.get<DefaultRequestSettings>("defaults");
		if (stored) Object.assign(defaults.value, stored);
		loaded = true;
	}

	return { defaults, initialize };
});
