import type { ThemeDefinition, ThemeMode } from "../theme/theme-registry";

const themeClassPrefix = "theme-";
let systemDarkQuery: MediaQueryList | null = null;
let systemDarkListener: (() => void) | null = null;

export function isCssColorDark(color: string, fallback: boolean): boolean {
	if (typeof document === "undefined") return fallback;
	const probe = document.createElement("span");
	probe.style.color = color;
	probe.style.position = "absolute";
	probe.style.visibility = "hidden";
	document.documentElement.append(probe);
	const resolvedColor = getComputedStyle(probe).color;
	probe.remove();

	const context = document
		.createElement("canvas")
		.getContext("2d", { willReadFrequently: true });
	if (!context || !resolvedColor) return fallback;
	context.fillStyle = resolvedColor;
	context.fillRect(0, 0, 1, 1);
	const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
	if (alpha === 0) return fallback;
	return (red * 299 + green * 587 + blue * 114) / 1000 < 150;
}

export function applyTheme(
	theme: ThemeDefinition,
	mode: ThemeMode,
	onSystemChange: () => void,
): boolean {
	const root = document.documentElement;
	for (const className of Array.from(root.classList)) {
		if (className.startsWith(themeClassPrefix)) {
			root.classList.remove(className);
		}
	}
	if (theme.className) {
		root.classList.add(theme.className);
	}

	installSystemModeListener(mode, onSystemChange);
	const shouldUseDark =
		mode === "dark" || (mode === "system" && Boolean(systemDarkQuery?.matches));
	root.classList.toggle("dark", shouldUseDark);
	root.style.colorScheme = shouldUseDark ? "dark" : "light";
	return shouldUseDark;
}

export function installSystemModeListener(
	mode: ThemeMode,
	onSystemChange: () => void,
): void {
	if (typeof window === "undefined") return;
	systemDarkQuery ??= window.matchMedia("(prefers-color-scheme: dark)");
	if (systemDarkListener) {
		systemDarkQuery.removeEventListener("change", systemDarkListener);
		systemDarkListener = null;
	}
	if (mode !== "system") return;
	systemDarkListener = () => {
		onSystemChange();
	};
	systemDarkQuery.addEventListener("change", systemDarkListener);
}
