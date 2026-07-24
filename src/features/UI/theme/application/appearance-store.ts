import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { builtInFonts, createImportedFont, type FontDefinition } from "@/features/UI/font/domain/font-registry";
import {
  builtInThemes,
  normalizeImportedTheme,
  type ThemeDefinition,
  type ThemeMode,
} from "../domain/theme-registry";

interface AppearanceSnapshot {
  themeId: string;
  themeMode: ThemeMode;
  customThemes: ThemeDefinition[];
  fontId: string;
  customFonts: FontDefinition[];
  fontSize: number;
  uiScale: number;
}

const storageKey = "pulsarai:appearance:v1";
const themeClassPrefix = "theme-";
let systemDarkQuery: MediaQueryList | null = null;
let systemDarkListener: (() => void) | null = null;

export const useAppearanceStore = defineStore("appearance", () => {
  const snapshot = readSnapshot();
  const themeId = ref(snapshot.themeId);
  const themeMode = ref<ThemeMode>(snapshot.themeMode);
  const customThemes = ref<ThemeDefinition[]>(snapshot.customThemes);
  const fontId = ref(snapshot.fontId);
  const customFonts = ref<FontDefinition[]>(snapshot.customFonts);
  const fontSize = ref(snapshot.fontSize);
  const uiScale = ref(snapshot.uiScale);

  const themes = computed(() => [...builtInThemes, ...customThemes.value]);
  const fonts = computed(() => [...builtInFonts, ...customFonts.value]);
  const activeTheme = computed(() => themes.value.find((theme) => theme.id === themeId.value) ?? builtInThemes[0]);
  const activeFont = computed(() => fonts.value.find((font) => font.id === fontId.value) ?? builtInFonts[0]);

  watch(
    [themeId, themeMode, customThemes, fontId, customFonts, fontSize, uiScale],
    () => {
      persistSnapshot({
        themeId: themeId.value,
        themeMode: themeMode.value,
        customThemes: customThemes.value,
        fontId: fontId.value,
        customFonts: customFonts.value,
        fontSize: fontSize.value,
        uiScale: uiScale.value,
      });
      applyAppearance();
    },
    { deep: true },
  );

  function initialize() {
    applyAppearance();
  }

  async function importThemeFile(file: File) {
    const theme = normalizeImportedTheme(await file.text());
    customThemes.value = [...customThemes.value.filter((item) => item.id !== theme.id), theme];
    themeId.value = theme.id;
  }

  function importFont(name: string, family: string) {
    const font = createImportedFont(name, family);
    customFonts.value = [...customFonts.value.filter((item) => item.id !== font.id), font];
    fontId.value = font.id;
  }

  function applyAppearance() {
    if (typeof document === "undefined") {
      return;
    }
    installCustomThemeStyles(customThemes.value);
    applyTheme(activeTheme.value, themeMode.value);
    applyFont(activeFont.value, fontSize.value);
    document.body.style.setProperty("zoom", String(uiScale.value / 100));
  }

  return {
    activeFont,
    activeTheme,
    customFonts,
    customThemes,
    fontId,
    fontSize,
    fonts,
    themeId,
    themeMode,
    themes,
    uiScale,
    importFont,
    importThemeFile,
    initialize,
  };
});

function applyTheme(theme: ThemeDefinition, mode: ThemeMode) {
  const root = document.documentElement;
  for (const className of Array.from(root.classList)) {
    if (className.startsWith(themeClassPrefix)) {
      root.classList.remove(className);
    }
  }
  if (theme.className) {
    root.classList.add(theme.className);
  }

  installSystemModeListener(mode);
  const shouldUseDark = mode === "dark" || (mode === "system" && Boolean(systemDarkQuery?.matches));
  root.classList.toggle("dark", shouldUseDark);
  root.style.colorScheme = shouldUseDark ? "dark" : "light";
}

function applyFont(font: FontDefinition, size: number) {
  const root = document.documentElement;
  root.style.setProperty("--font-sans", font.sans);
  root.style.setProperty("--font-serif", font.serif);
  root.style.setProperty("--font-mono", font.mono);
  root.style.fontSize = `${size}px`;
  root.style.fontFamily = font.sans;
}

function installCustomThemeStyles(themes: ThemeDefinition[]) {
  const styleId = "pulsarai-custom-themes";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.append(style);
  }
  style.textContent = [...builtInThemes, ...themes].map((theme) => theme.css ?? "").join("\n\n");
}

function installSystemModeListener(mode: ThemeMode) {
  if (typeof window === "undefined") {
    return;
  }
  systemDarkQuery ??= window.matchMedia("(prefers-color-scheme: dark)");
  if (systemDarkListener) {
    systemDarkQuery.removeEventListener("change", systemDarkListener);
    systemDarkListener = null;
  }
  if (mode !== "system") {
    return;
  }
  systemDarkListener = () => {
    const root = document.documentElement;
    root.classList.toggle("dark", Boolean(systemDarkQuery?.matches));
    root.style.colorScheme = systemDarkQuery?.matches ? "dark" : "light";
  };
  systemDarkQuery.addEventListener("change", systemDarkListener);
}

function readSnapshot(): AppearanceSnapshot {
  const fallback: AppearanceSnapshot = {
    themeId: builtInThemes[0].id,
    themeMode: "system",
    customThemes: [],
    fontId: builtInFonts[0].id,
    customFonts: [],
    fontSize: 16,
    uiScale: 100,
  };
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return fallback;
  }
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<AppearanceSnapshot>) };
  } catch {
    return fallback;
  }
}

function persistSnapshot(snapshot: AppearanceSnapshot) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }
}
