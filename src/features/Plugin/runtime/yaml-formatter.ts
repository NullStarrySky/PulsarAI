function parseYamlValue(value: string): unknown {
	if (/^true$/i.test(value)) return true;
	if (/^false$/i.test(value)) return false;
	if (/^(null|~)$/i.test(value)) return null;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	)
		return value.slice(1, -1);
	return value;
}

function parseYamlContent(source: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	let currentKey: string | null = null;
	let currentList: unknown[] | null = null;
	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		if (line.startsWith("- ")) {
			if (currentKey && currentList)
				currentList.push(parseYamlValue(line.slice(2).trim()));
			continue;
		}
		const separator = line.indexOf(":");
		if (separator < 0) continue;
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		currentKey = key;
		currentList = value ? null : [];
		result[key] = currentList ?? parseYamlValue(value);
	}
	return result;
}

function extractItem(text: string) {
	const formatter: object[] = [];
	const strip = (source: string, pattern: RegExp) =>
		source.replace(pattern, (_match, yaml: string) => {
			const value = parseYamlContent(yaml);
			if (Object.keys(value).length) formatter.push(value);
			return "";
		});
	const withoutFrontmatter = strip(
		text,
		/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/g,
	);
	return {
		result: strip(
			withoutFrontmatter,
			/```(?:yaml|yml)\r?\n([\s\S]*?)\r?\n```(?:\r?\n)?/gi,
		).trim(),
		formatter,
	};
}

export function extractYAMLFormatter(input: string | string[]) {
	return (Array.isArray(input) ? input : [input]).map(extractItem);
}
