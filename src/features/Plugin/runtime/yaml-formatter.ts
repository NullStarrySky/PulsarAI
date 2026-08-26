function extractYAMLFormatterItem(text: string): { result: string; formatter: object[] } {
  if (typeof text !== "string") return { result: "", formatter: [] };

  const formatter: object[] = [];
  let cleanedText = text;
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/g;
  cleanedText = cleanedText.replace(frontmatterRegex, (_, yamlBlock: string) => {
    const parsed = parseYamlContent(yamlBlock);
    if (Object.keys(parsed).length > 0) formatter.push(parsed);
    return "";
  });
  const codeblockRegex = /```(?:yaml|yml)\r?\n([\s\S]*?)\r?\n```(?:\r?\n)?/gi;
  cleanedText = cleanedText.replace(codeblockRegex, (_, yamlBlock: string) => {
    const parsed = parseYamlContent(yamlBlock);
    if (Object.keys(parsed).length > 0) formatter.push(parsed);
    return "";
  });
  return { result: cleanedText.trim(), formatter };
}

export function extractYAMLFormatter(
  input: string | string[],
): Array<{ result: string; formatter: object[] }> {
  return (Array.isArray(input) ? input : [input]).map(extractYAMLFormatterItem);
}

function parseYamlContent(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: unknown[] | null = null;
  for (const rawLine of yamlStr.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("- ")) {
      if (currentKey && currentList) currentList.push(parseYamlValue(line.slice(2).trim()));
      continue;
    }
    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;
    const key = line.slice(0, colonIndex).trim();
    const rawValue = line.slice(colonIndex + 1).trim();
    currentKey = key;
    currentList = rawValue ? null : [];
    result[key] = currentList ?? parseYamlValue(rawValue);
  }
  return result;
}

function parseYamlValue(value: string): unknown {
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^(null|~)$/i.test(value)) return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
