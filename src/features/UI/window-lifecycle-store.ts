import { defineStore } from "pinia";
import { ref } from "vue";
import type { WindowCloseBehavior } from "@/features/Environment/defaults";
import { host } from "@/host";

export const useWindowLifecycleStore = defineStore("window-lifecycle", () => {
	const closeBehavior = ref<WindowCloseBehavior>("ask");
	const closePromptOpen = ref(false);
	const rememberCloseChoice = ref(false);

	function setCloseBehavior(value: WindowCloseBehavior) {
		closeBehavior.value = value;
		void host.config.set("windowCloseBehavior", value);
	}

	async function initialize() {
		const stored = await host.config.get<WindowCloseBehavior>(
			"windowCloseBehavior",
		);
		if (stored) closeBehavior.value = stored;
	}

	async function handleCloseRequest() {
		if (closeBehavior.value === "ask") {
			rememberCloseChoice.value = false;
			closePromptOpen.value = true;
			return;
		}
		await applyCloseChoice(closeBehavior.value);
	}

	function dismissClosePrompt() {
		closePromptOpen.value = false;
		rememberCloseChoice.value = false;
	}

	async function chooseCloseBehavior(
		choice: Exclude<WindowCloseBehavior, "ask">,
	) {
		if (rememberCloseChoice.value) setCloseBehavior(choice);
		closePromptOpen.value = false;
		rememberCloseChoice.value = false;
		await applyCloseChoice(choice);
	}

	async function applyCloseChoice(choice: Exclude<WindowCloseBehavior, "ask">) {
		if (choice === "tray") await host.desktop?.window.hide();
		else await host.desktop?.window.close();
	}

	return {
		closeBehavior,
		closePromptOpen,
		rememberCloseChoice,
		setCloseBehavior,
		initialize,
		handleCloseRequest,
		dismissClosePrompt,
		chooseCloseBehavior,
	};
});
