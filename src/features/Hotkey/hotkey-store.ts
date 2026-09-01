import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useCommandStore } from "./command-store";

const hotkeyStorageKey = "pulsarai:hotkeys:v1";

export const useHotkeyStore = defineStore("hotkey", () => {
	const overrides = ref<Record<string, string | null>>(readHotkeys());
	const commandStore = useCommandStore();

	const hotkeysByCommandId = computed(() => {
		const result = new Map<string, string>();
		for (const command of commandStore.commands) {
			const override = overrides.value[command.id];
			const hotkey = override === undefined ? command.defaultHotkey : override;
			if (hotkey) {
				result.set(command.id, hotkey);
			}
		}
		return result;
	});

	watch(overrides, () => persistHotkeys(overrides.value), { deep: true });

	function getHotkey(commandId: string) {
		return hotkeysByCommandId.value.get(commandId) ?? "";
	}

	function setHotkey(commandId: string, hotkey: string) {
		overrides.value = {
			...overrides.value,
			[commandId]: normalizeHotkey(hotkey),
		};
	}

	function clearHotkey(commandId: string) {
		overrides.value = { ...overrides.value, [commandId]: null };
	}

	function resetHotkey(commandId: string) {
		const next = { ...overrides.value };
		delete next[commandId];
		overrides.value = next;
	}

	function commandIdForEvent(event: KeyboardEvent) {
		const normalized = normalizeKeyboardEvent(event);
		if (!normalized) {
			return null;
		}

		for (const [commandId, hotkey] of hotkeysByCommandId.value.entries()) {
			if (normalizeHotkey(hotkey) === normalized) {
				return commandId;
			}
		}
		return null;
	}

	return {
		overrides,
		hotkeysByCommandId,
		getHotkey,
		setHotkey,
		clearHotkey,
		resetHotkey,
		commandIdForEvent,
	};
});

export function normalizeKeyboardEvent(event: KeyboardEvent) {
	const key = normalizeKey(event.key);
	if (!key || ["Control", "Shift", "Alt", "Meta"].includes(key)) {
		return "";
	}

	const parts = [];
	if (event.ctrlKey) parts.push("Ctrl");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey) parts.push("Shift");
	if (event.metaKey) parts.push("Meta");
	parts.push(key);
	return parts.join("+");
}

function normalizeHotkey(hotkey: string) {
	const parts = hotkey
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean);
	const modifiers = new Set<string>();
	let key = "";

	for (const part of parts) {
		const normalized = normalizeKey(part);
		if (["Ctrl", "Alt", "Shift", "Meta"].includes(normalized)) {
			modifiers.add(normalized);
		} else {
			key = normalized;
		}
	}

	return [
		...["Ctrl", "Alt", "Shift", "Meta"].filter((item) => modifiers.has(item)),
		key,
	]
		.filter(Boolean)
		.join("+");
}

function normalizeKey(key: string) {
	const aliases: Record<string, string> = {
		Control: "Ctrl",
		Esc: "Escape",
		" ": "Space",
		ArrowUp: "Up",
		ArrowDown: "Down",
		ArrowLeft: "Left",
		ArrowRight: "Right",
	};
	const named = aliases[key] ?? key;
	if (named.length === 1) {
		return named.toUpperCase();
	}
	return named.slice(0, 1).toUpperCase() + named.slice(1);
}

function readHotkeys(): Record<string, string | null> {
	if (typeof localStorage === "undefined") {
		return {};
	}

	const raw = localStorage.getItem(hotkeyStorageKey);
	if (!raw) {
		return {};
	}

	try {
		return JSON.parse(raw) as Record<string, string | null>;
	} catch (error) {
		console.warn("Unable to read hotkeys", error);
		return {};
	}
}

function persistHotkeys(hotkeys: Record<string, string | null>) {
	if (typeof localStorage === "undefined") {
		return;
	}

	localStorage.setItem(hotkeyStorageKey, JSON.stringify(hotkeys));
}
