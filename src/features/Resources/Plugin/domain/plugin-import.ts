export type PluginImportCall =
  | { kind: "resource"; value: string }
  | { kind: "resourceById"; value: string }
  | { kind: "container"; scope: "local" | "global"; name: string }
  | { kind: "configLocal"; groupId: string; contentId: string }
  | { kind: "configGlobal"; pluginId: string; groupId: string; contentId: string };

export interface PluginImports {
  resource(path: string): unknown;
  resourceById(resourceId: string): unknown;
  container(scope: "local" | "global", name: string): unknown;
  config: {
    local(groupId: string, contentId: string): unknown;
    global(pluginId: string, groupId: string, contentId: string): unknown;
  };
}

export interface PluginImportSuggestion {
  label: string;
  apply: string;
  detail: string;
  description?: string;
}

const stringLiteral = String.raw`("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')`;
const resourcePattern = new RegExp(
  String.raw`\bimports\s*\.\s*(resource|resourceById)\s*\(\s*${stringLiteral}\s*\)`,
  "g",
);
const containerPattern = new RegExp(
  String.raw`\bimports\s*\.\s*container\s*\(\s*${stringLiteral}\s*,\s*${stringLiteral}\s*\)`,
  "g",
);
const localConfigPattern = new RegExp(
  String.raw`\bimports\s*\.\s*config\s*\.\s*local\s*\(\s*${stringLiteral}\s*,\s*${stringLiteral}\s*\)`,
  "g",
);
const globalConfigPattern = new RegExp(
  String.raw`\bimports\s*\.\s*config\s*\.\s*global\s*\(\s*${stringLiteral}\s*,\s*${stringLiteral}\s*,\s*${stringLiteral}\s*\)`,
  "g",
);

export function findPluginImportCalls(source: string): PluginImportCall[] {
  const calls: PluginImportCall[] = [];
  for (const match of source.matchAll(resourcePattern)) {
    calls.push({
      kind: match[1] as "resource" | "resourceById",
      value: decodeLiteral(match[2] ?? ""),
    });
  }
  for (const match of source.matchAll(containerPattern)) {
    const scope = decodeLiteral(match[1] ?? "");
    if (scope === "local" || scope === "global") {
      calls.push({
        kind: "container",
        scope,
        name: decodeLiteral(match[2] ?? ""),
      });
    }
  }
  for (const match of source.matchAll(localConfigPattern)) {
    calls.push({
      kind: "configLocal",
      groupId: decodeLiteral(match[1] ?? ""),
      contentId: decodeLiteral(match[2] ?? ""),
    });
  }
  for (const match of source.matchAll(globalConfigPattern)) {
    calls.push({
      kind: "configGlobal",
      pluginId: decodeLiteral(match[1] ?? ""),
      groupId: decodeLiteral(match[2] ?? ""),
      contentId: decodeLiteral(match[3] ?? ""),
    });
  }
  return calls;
}

function decodeLiteral(value: string) {
  const quote = value[0];
  const content = value.slice(1, -1);
  try {
    return quote === '"'
      ? JSON.parse(value) as string
      : JSON.parse(`"${content.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`) as string;
  } catch {
    return content;
  }
}
