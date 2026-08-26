import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { builtInFonts, createImportedFont, type FontDefinition } from "@/features/UI/font/font-registry";
import {
  builtInThemes,
  normalizeImportedTheme,
  type ThemeDefinition,
  type ThemeMode,
} from "./theme-registry";
import {
  syncMobileNavigationBar,
  type MobileNavigationBarMode,
} from "@/features/Misc/mobile-navigation-bar";

export type AgentLoadingStyle = "drive" | "dots" | "orbit";

interface AppearanceSnapshot {
  themeId: string;
  themeMode: ThemeMode;
  customThemes: ThemeDefinition[];
  customCss: string;
  fontId: string;
  customFonts: FontDefinition[];
  fontSize: number;
  uiScale: number;
  composerSendWithEnter: boolean;
  interactiveCodePreview: boolean;
  agentLoadingStyle: AgentLoadingStyle;
  mobileNavigationBarMode: MobileNavigationBarMode;
  zenFrameEnabled: boolean;
  frameColorMode: "auto" | "custom";
  frameCustomColor: string;
  editorFontSize: number;
  editorLineHeight: number;
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
  const composerSendWithEnter = ref(snapshot.composerSendWithEnter);
  const interactiveCodePreview = ref(snapshot.interactiveCodePreview);
  const agentLoadingStyle = ref<AgentLoadingStyle>(snapshot.agentLoadingStyle);
  const mobileNavigationBarMode = ref(snapshot.mobileNavigationBarMode);
  const zenFrameEnabled = ref<boolean>(snapshot.zenFrameEnabled ?? true);
  const frameColorMode = ref<"auto" | "custom">(snapshot.frameColorMode ?? "auto");
  const frameCustomColor = ref(snapshot.frameCustomColor ?? "#1e1e24");
  const editorFontSize = ref(snapshot.editorFontSize ?? 14);
  const editorLineHeight = ref(snapshot.editorLineHeight ?? 16);

  const themes = computed(() => [...builtInThemes, ...customThemes.value]);
  const fonts = computed(() => [...builtInFonts, ...customFonts.value]);
  const activeTheme = computed(() => themes.value.find((theme) => theme.id === themeId.value) ?? builtInThemes[0]);
  const activeFont = computed(() => fonts.value.find((font) => font.id === fontId.value) ?? builtInFonts[0]);

  const zenFrameIsDark = ref(true);

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
      composerSendWithEnter,
      interactiveCodePreview,
      agentLoadingStyle,
      mobileNavigationBarMode,
      zenFrameEnabled,
      frameColorMode,
      frameCustomColor,
      editorFontSize,
      editorLineHeight,
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
        composerSendWithEnter: composerSendWithEnter.value,
        interactiveCodePreview: interactiveCodePreview.value,
        agentLoadingStyle: agentLoadingStyle.value,
        mobileNavigationBarMode: mobileNavigationBarMode.value,
        zenFrameEnabled: zenFrameEnabled.value,
        frameColorMode: frameColorMode.value,
        frameCustomColor: frameCustomColor.value,
        editorFontSize: editorFontSize.value,
        editorLineHeight: editorLineHeight.value,
      });
      applyAppearance();
    },
    { deep: true },
  );

  function initialize() {
    applyAppearance();
  }

  async function importThemeFile(file: File) {
    return importThemeCss(await file.text());
  }

  function importThemeCss(css: string) {
    if (!css.trim()) throw new Error("主题 CSS 不能为空。");
    const theme = normalizeImportedTheme(css);
    customThemes.value = [...customThemes.value.filter((item) => item.id !== theme.id), theme];
    themeId.value = theme.id;
    return theme;
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
    installCustomCss(customCss.value);
    const topBarIsDark = applyTheme(
      activeTheme.value,
      themeMode.value,
      applyAppearance,
    );
    applyFont(activeFont.value, fontSize.value);
    document.body.style.setProperty("zoom", String(uiScale.value / 100));
    if (frameColorMode.value === "custom" && frameCustomColor.value) {
      document.documentElement.style.setProperty("--zen-frame-bg", frameCustomColor.value);
      document.documentElement.style.setProperty("--zen-frame-border", frameCustomColor.value);
    } else {
      document.documentElement.style.removeProperty("--zen-frame-bg");
      document.documentElement.style.removeProperty("--zen-frame-border");
    }
    zenFrameIsDark.value = isCssColorDark(
      zenFrameEnabled.value
        ? "var(--zen-frame-bg)"
        : "var(--background)",
      topBarIsDark,
    );
    document.documentElement.style.setProperty("--editor-font-size", `${editorFontSize.value}px`);
    document.documentElement.style.setProperty("--editor-line-height", `${editorLineHeight.value}px`);
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
    composerSendWithEnter,
    interactiveCodePreview,
    agentLoadingStyle,
    fontId,
    fontSize,
    fonts,
    themeId,
    themeMode,
    mobileNavigationBarMode,
    zenFrameEnabled,
    zenFrameIsDark,
    frameColorMode,
    frameCustomColor,
    editorFontSize,
    editorLineHeight,
    themes,
    uiScale,
    importFont,
    importThemeCss,
    importThemeFile,
    initialize,
  };
});

function isCssColorDark(color: string, fallback: boolean): boolean {
  if (typeof document === "undefined") return fallback;
  const probe = document.createElement("span");
  probe.style.color = color;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.documentElement.append(probe);
  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context || !resolvedColor) return fallback;
  context.fillStyle = resolvedColor;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return fallback;
  return (red * 299 + green * 587 + blue * 114) / 1000 < 150;
}

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
    composerSendWithEnter: true,
    interactiveCodePreview: false,
    agentLoadingStyle: "drive",
    mobileNavigationBarMode: "topbar",
    zenFrameEnabled: true,
    frameColorMode: "auto",
    frameCustomColor: "#1e1e24",
    editorFontSize: 14,
    editorLineHeight: 16,
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
      composerSendWithEnter:
        typeof parsed.composerSendWithEnter === "boolean"
          ? parsed.composerSendWithEnter
          : fallback.composerSendWithEnter,
      interactiveCodePreview:
        typeof parsed.interactiveCodePreview === "boolean"
          ? parsed.interactiveCodePreview
          : fallback.interactiveCodePreview,
      agentLoadingStyle:
        parsed.agentLoadingStyle === "dots" || parsed.agentLoadingStyle === "orbit"
          ? parsed.agentLoadingStyle
          : "drive",
      zenFrameEnabled: typeof parsed.zenFrameEnabled === "boolean" ? parsed.zenFrameEnabled : fallback.zenFrameEnabled,
      frameColorMode: parsed.frameColorMode === "custom" ? "custom" : "auto",
      frameCustomColor: typeof parsed.frameCustomColor === "string" ? parsed.frameCustomColor : fallback.frameCustomColor,
      editorFontSize: typeof parsed.editorFontSize === "number" ? parsed.editorFontSize : fallback.editorFontSize,
      editorLineHeight: typeof parsed.editorLineHeight === "number" ? parsed.editorLineHeight : fallback.editorLineHeight,
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
