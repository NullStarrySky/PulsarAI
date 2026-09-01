export type PluginLogKind =
	| "import"
	| "condition"
	| "api"
	| "sandbox"
	| "error"
	| "info";

export interface PluginLogEntry {
	depth: number;
	type: PluginLogKind;
	message: string;
	path?: string;
	timestamp: string;
}

export class PluginLogger {
	readonly logs: PluginLogEntry[] = [];

	append(
		message: string,
		depth = 0,
		type: PluginLogKind = "info",
		path?: string,
	) {
		this.logs.push({
			depth,
			type,
			message,
			path,
			timestamp: new Date().toISOString(),
		});
	}

	child(message: string, path?: string) {
		this.append(message, 0, "info", path);
		return {
			append: (detail: string, type: PluginLogKind = "info") =>
				this.append(detail, 1, type, path),
		};
	}

	toFormattedText() {
		return this.logs
			.map(
				(entry) =>
					`${"  ".repeat(entry.depth)}[${entry.type.toUpperCase()}] ${entry.message}`,
			)
			.join("\n");
	}
}
