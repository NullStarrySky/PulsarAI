import amberMinimalCss from "./styles/theme/amber-minimal.css?raw";
import catppuccinCss from "./styles/theme/catppuccin.css?raw";
import claymorphismCss from "./styles/theme/claymorphism.css?raw";
import cleanSlateCss from "./styles/theme/clean-slate.css?raw";
import defaultCss from "./styles/theme/default.css?raw";
import solarDuskCss from "./styles/theme/solar-dusk.css?raw";
import tangerineCss from "./styles/theme/tangerine.css?raw";
import twitterCss from "./styles/theme/twitter.css?raw";
import violetBloomCss from "./styles/theme/violet-bloom.css?raw";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeDefinition {
  id: string;
  name: string;
  className: string;
  accent: string;
  css?: string;
}

const builtInThemeFiles = [
  { id: "default", name: "Default", css: defaultCss },
  { id: "catppuccin", name: "Catppuccin", css: catppuccinCss },
  { id: "tangerine", name: "Tangerine", css: tangerineCss },
  { id: "amberminimal", name: "Amber Minimal", css: amberMinimalCss },
  { id: "cleanslate", name: "Clean Slate", css: cleanSlateCss },
  { id: "solardusk", name: "Solar Dusk", css: solarDuskCss },
  { id: "claymorphism", name: "Claymorphism", css: claymorphismCss },
  { id: "violetbloom", name: "Violet Bloom", css: violetBloomCss },
  { id: "twitter", name: "Twitter", css: twitterCss },
];

export const builtInThemes: ThemeDefinition[] = builtInThemeFiles.map((file) =>
  parseThemeCss(file.css, file.id, file.name),
);

export function parseThemeCss(css: string, fallbackId = `custom-${Date.now()}`, fallbackName = "Imported Theme") {
  const className =
    css.match(/\.([a-zA-Z0-9_-]*theme-[a-zA-Z0-9_-]+)/)?.[1] ??
    (fallbackId === "default" ? "" : `theme-${slugify(fallbackId)}`);
  const id = className ? className.replace(/^theme-/, "") : fallbackId;
  const accent = parseCssVariable(css, "--primary") ?? "oklch(0.7 0.18 260)";
  const name = fallbackName === "Imported Theme" ? toTitleCase(id) : fallbackName;

  return {
    id,
    name,
    className,
    accent,
    css: className && !css.includes(`.${className}`) ? wrapCssInClass(css, className) : css,
  } satisfies ThemeDefinition;
}

export function normalizeImportedTheme(css: string) {
  const parsed = parseThemeCss(css);
  if (parsed.css?.includes(`.${parsed.className}`)) {
    return parsed;
  }
  return {
    ...parsed,
    css: wrapCssInClass(css, parsed.className),
  };
}

function parseCssVariable(css: string, variableName: string) {
  const escaped = variableName.replace(/-/g, "\\-");
  return css.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`))?.[1]?.trim() ?? null;
}

function wrapCssInClass(css: string, className: string) {
  return css.replace(/:root/g, `.${className}`);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .replace(/^theme-/, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
