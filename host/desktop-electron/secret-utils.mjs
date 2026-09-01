export async function hydrateSecretPlaceholders(input, readSecret) {
	let output = "";
	let rest = input;
	while (true) {
		const start = rest.indexOf("<<");
		if (start < 0) return output + rest;
		const end = rest.indexOf(">>", start + 2);
		if (end < 0) return output + rest;
		output += rest.slice(0, start);
		const name = rest.slice(start + 2, end);
		const value = await readSecret(name);
		if (typeof value !== "string" || !value)
			throw new Error(`Missing secret: ${name}`);
		output += value;
		rest = rest.slice(end + 2);
	}
}

export function secretPreview(value) {
	if (typeof value !== "string" || !value) return "";
	if (value.length <= 6) return `${value.slice(0, 1)}…${value.slice(-1)}`;
	if (value.length <= 12) return `${value.slice(0, 4)}…${value.slice(-2)}`;
	return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
