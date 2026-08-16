export interface FontDefinition {
  id: string;
  name: string;
  sans: string;
  serif: string;
  mono: string;
}

export const builtInFonts: FontDefinition[] = [
  {
    id: "inter",
    name: "System UI",
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "serif",
    name: "Serif Notes",
    sans: 'Georgia, Cambria, "Times New Roman", Times, serif',
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    id: "mono",
    name: "Mono Workbench",
    sans: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
    mono: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
];

export function createImportedFont(name: string, family: string): FontDefinition {
  return {
    id: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    sans: family,
    serif: family,
    mono: builtInFonts[0].mono,
  };
}
