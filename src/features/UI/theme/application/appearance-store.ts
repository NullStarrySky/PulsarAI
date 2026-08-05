import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { builtInFonts, createImportedFont, type FontDefinition } from "@/features/UI/font/domain/font-registry";
import {
  builtInThemes,
  normalizeImportedTheme,
  type ThemeDefinition,
  type ThemeMode,
} from "../domain/theme-registry";
import {
  defaultComposerToolbarLayout,
  normalizeComposerToolbarLayout,
  type ComposerToolbarLayout,
} from "@/features/UI/domain/composer-toolbar";
import {
  syncMobileNavigationBar,
  type MobileNavigationBarMode,
} from "@/features/Misc/application/mobile-navigation-bar";

interface AppearanceSnapshot {
  themeId: string;
  themeMode: ThemeMode;
  customThemes: ThemeDefinition[];
  customCss: string;
  fontId: string;
  customFonts: FontDefinition[];
  fontSize: number;
  uiScale: number;
  composerToolbar: ComposerToolbarLayout;
  composerSendWithEnter: boolean;
  interactiveCodePreview: boolean;
  mobileNavigationBarMode: MobileNavigationBarMode;
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
  const customCss = ref(snapshot.customCss);
  const fontId = ref(snapshot.fontId);
  const customFonts = ref<FontDefinition[]>(snapshot.customFonts);
  const fontSize = ref(snapshot.fontSize);
  const uiScale = ref(snapshot.uiScale);
  const composerToolbar = ref(snapshot.composerToolbar);
  const composerSendWithEnter = ref(snapshot.composerSendWithEnter);
  const interactiveCodePreview = ref(snapshot.interactiveCodePreview);
  const mobileNavigationBarMode = ref(snapshot.mobileNavigationBarMode);

  const themes = computed(() => [...builtInThemes, ...customThemes.value]);
  const fonts = computed(() => [...builtInFonts, ...customFonts.value]);
  const activeTheme = computed(() => themes.value.find((theme) => theme.id === themeId.value) ?? builtInThemes[0]);
  const activeFont = computed(() => fonts.value.find((font) => font.id === fontId.value) ?? builtInFonts[0]);

  watch(
    [
      themeId,
      themeMode,
      customThemes,
      customCss,
      fontId,
      customFonts,
      fontSize,
      uiScale,
      composerToolbar,
      composerSendWithEnter,
      interactiveCodePreview,
      mobileNavigationBarMode,
    ],
    () => {
      persistSnapshot({
        themeId: themeId.value,
        themeMode: themeMode.value,
        customThemes: customThemes.value,
        customCss: customCss.value,
        fontId: fontId.value,
        customFonts: customFonts.value,
        fontSize: fontSize.value,
        uiScale: uiScale.value,
        composerToolbar: composerToolbar.value,
        composerSendWithEnter: composerSendWithEnter.value,
        interactiveCodePreview: interactiveCodePreview.value,
        mobileNavigationBarMode: mobileNavigationBarMode.value,
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

  function setComposerToolbar(layout: ComposerToolbarLayout) {
    composerToolbar.value = normalizeComposerToolbarLayout(layout);
  }

  function applyAppearance() {
    if (typeof document === "undefined") {
      return;
    }
    installCustomThemeStyles(customThemes.value);
    installCustomCss(customCss.value);
    const topBarIsDark = applyTheme(
      activeTheme.value,
      themeMode.value,
      applyAppearance,
    );
    applyFont(activeFont.value, fontSize.value);
    document.body.style.setProperty("zoom", String(uiScale.value / 100));
    void syncMobileNavigationBar(
      mobileNavigationBarMode.value,
      topBarIsDark,
    );
  }

  return {
    activeFont,
    activeTheme,
    customFonts,
    customCss,
    customThemes,
    composerToolbar,
    composerSendWithEnter,
    interactiveCodePreview,
    fontId,
    fontSize,
    fonts,
    themeId,
    themeMode,
    mobileNavigationBarMode,
    themes,
    uiScale,
    importFont,
    importThemeFile,
    initialize,
    setComposerToolbar,
  };
});

function applyTheme(
  theme: ThemeDefinition,
  mode: ThemeMode,
  onSystemChange: () => void,
) {
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
  const shouldUseDark = mode === "dark" || (mode === "system" && Boolean(systemDarkQuery?.matches));
  root.classList.toggle("dark", shouldUseDark);
  root.style.colorScheme = shouldUseDark ? "dark" : "light";
  return shouldUseDark;
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

function installCustomCss(css: string) {
  const styleId = "pulsarai-custom-css";
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = styleId;
    document.head.append(style);
  }
  style.textContent = css;
}

function installSystemModeListener(mode: ThemeMode, onSystemChange: () => void) {
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
    onSystemChange();
  };
  systemDarkQuery.addEventListener("change", systemDarkListener);
}

function readSnapshot(): AppearanceSnapshot {
  const fallback: AppearanceSnapshot = {
    themeId: builtInThemes[0].id,
    themeMode: "system",
    customThemes: [],
    customCss: "",
    fontId: builtInFonts[0].id,
    customFonts: [],
    fontSize: 16,
    uiScale: 100,
    composerToolbar: structuredClone(defaultComposerToolbarLayout),
    composerSendWithEnter: true,
    interactiveCodePreview: false,
    mobileNavigationBarMode: "topbar",
  };
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppearanceSnapshot>;
    return {
      ...fallback,
      ...parsed,
      customCss: typeof parsed.customCss === "string" ? parsed.customCss : "",
      composerToolbar: normalizeComposerToolbarLayout(parsed.composerToolbar),
      composerSendWithEnter:
        typeof parsed.composerSendWithEnter === "boolean"
          ? parsed.composerSendWithEnter
          : fallback.composerSendWithEnter,
      interactiveCodePreview:
        typeof parsed.interactiveCodePreview === "boolean"
          ? parsed.interactiveCodePreview
          : fallback.interactiveCodePreview,
    };
  } catch {
    return fallback;
  }
}

function persistSnapshot(snapshot: AppearanceSnapshot) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }
}
