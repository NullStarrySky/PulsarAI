import { computed, ref } from "vue";

const iconModules = import.meta.glob("../icons/{dark,light}/*.png", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

export type ProviderIconVariant = "dark" | "light";

const providerIcons: Record<ProviderIconVariant, Map<string, string>> = {
	dark: new Map(),
	light: new Map(),
};

for (const [path, url] of Object.entries(iconModules)) {
	const match = /[/\\](dark|light)[/\\]([^/\\]+)\.png$/.exec(path);
	if (match) {
		providerIcons[match[1] as ProviderIconVariant].set(match[2], url);
	}
}

/** OpenAI comes first as the default icon for custom providers; the rest stay alphabetical. */
export const providerIconIds: string[] = [
	"openai",
	...[...providerIcons.light.keys()].filter((id) => id !== "openai").sort(),
];

const isDarkTheme = ref(false);
if (typeof document !== "undefined") {
	isDarkTheme.value = document.documentElement.classList.contains("dark");
	if (typeof MutationObserver !== "undefined") {
		new MutationObserver(() => {
			isDarkTheme.value = document.documentElement.classList.contains("dark");
		}).observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}
}

/** Tracks the applied root theme so mono icons can follow light/dark reactively. */
export function useProviderIconVariant() {
	return computed<ProviderIconVariant>(() =>
		isDarkTheme.value ? "dark" : "light",
	);
}

function currentVariant(): ProviderIconVariant {
	return typeof document !== "undefined" &&
		document.documentElement.classList.contains("dark")
		? "dark"
		: "light";
}

export function providerIconUrl(
	providerId?: string,
	fallbackUrl?: string,
	variant: ProviderIconVariant = currentVariant(),
): string {
	const id = providerId?.trim().toLowerCase();
	if (id) {
		const iconUrl = providerIcons[variant].get(id);
		if (iconUrl) {
			return iconUrl;
		}
	}
	return fallbackUrl ?? "";
}
