function extractYAMLFormatterItem(text: string): { result: string; formatter: object[] } {
  if (typeof text !== "string") {
    return { result: "", formatter: [] };
  }

  const formatter: object[] = [];
  let cleanedText = text;

  // 1. Extract frontmatter: ^---\r?\n([\s\S]*?)\r?\n---
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/g;
  cleanedText = cleanedText.replace(frontmatterRegex, (_, yamlBlock: string) => {
    const parsed = parseYamlContent(yamlBlock);
    if (Object.keys(parsed).length > 0) {
      formatter.push(parsed);
    }
    return "";
  });

  // 2. Extract yaml code blocks: ```yaml ... ``` or ```yml ... ```
  const codeblockRegex = /```(?:yaml|yml)\r?\n([\s\S]*?)\r?\n```(?:\r?\n)?/gi;
  cleanedText = cleanedText.replace(codeblockRegex, (_, yamlBlock: string) => {
    const parsed = parseYamlContent(yamlBlock);
    if (Object.keys(parsed).length > 0) {
      formatter.push(parsed);
    }
    return "";
  });

  return {
    result: cleanedText.trim(),
    formatter,
  };
}

export function extractYAMLFormatter(
  input: string | string[],
): Array<{ result: string; formatter: object[] }> {
  const items = Array.isArray(input) ? input : [input];
  return items.map((item) => extractYAMLFormatterItem(item));
}

function parseYamlContent(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentList: unknown[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("- ")) {
      const val = parseYamlValue(line.slice(2).trim());
      if (currentKey && currentList) {
        currentList.push(val);
      }
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex > -1) {
      const key = line.slice(0, colonIndex).trim();
      const rawVal = line.slice(colonIndex + 1).trim();
      if (!rawVal) {
        currentKey = key;
        currentList = [];
        result[key] = currentList;
      } else {
        currentKey = key;
        currentList = null;
        result[key] = parseYamlValue(rawVal);
      }
    }
  }

  return result;
}

function parseYamlValue(str: string): unknown {
  if (str === "true" || str === "True" || str === "TRUE") return true;
  if (str === "false" || str === "False" || str === "FALSE") return false;
  if (str === "null" || str === "Null" || str === "NULL" || str === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}
