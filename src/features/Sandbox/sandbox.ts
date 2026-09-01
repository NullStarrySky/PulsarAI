import type { ModelMessage } from "ai";

export type SandboxEnvironment = Record<string | number, unknown>;

export type ResolveTextOptions = {
	keepArraySet2StrDefault?: boolean;
	maxDepth?: number;
	logger?: {
		append(message: string, depth?: number, type?: string, path?: string): void;
	};
};

const defaultMaxDepth = 30;
const inlinePattern = /(\{\{([\s\S]*?)\}\}|\[\[([\s\S]*?)\]\])/g;

function mergeEnvironment(
	environments: SandboxEnvironment[] = [],
): SandboxEnvironment {
	return Object.assign({}, ...environments);
}

export async function executeSandboxCodeAsync(
	code: string,
	environments: SandboxEnvironment[] = [],
): Promise<unknown> {
	try {
		const environment = mergeEnvironment(environments);
		const body = buildExecutableBody(code.trim(), environment);
		const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
		const runner = new AsyncFunction(
			"environment",
			`with (environment) {\n${body}\n}`,
		);
		const result = await runner.call(environment, environment);
		return typeof result === "function"
			? await result.call(environment, environment)
			: result;
	} catch (error) {
		throw sandboxExecutionError(error, code);
	}
}

/** Runs a synchronous expression or statement block against the supplied environment. */
export function executeSandboxCode(
	code: string,
	environments: SandboxEnvironment[] = [],
): unknown {
	try {
		const environment = mergeEnvironment(environments);
		const body = buildExecutableBody(code.trim(), environment);
		const runner = new Function(
			"environment",
			`with (environment) {\n${body}\n}`,
		);
		return runner.call(environment, environment);
	} catch (error) {
		throw sandboxExecutionError(error, code);
	}
}

export function createSandboxFunction(
	code: string,
	environments: SandboxEnvironment[] = [],
): (...args: unknown[]) => unknown {
	try {
		const environment = mergeEnvironment(environments);
		const body = buildExecutableBody(code.trim(), environment);
		const runner = new Function(
			"environment",
			`with (environment) {\n${body}\n}`,
		);
		const value = runner.call(environment, environment);
		if (typeof value !== "function") {
			throw new Error("自定义工具的 tool.js 必须只包含一个函数。");
		}
		return (...args: unknown[]) => {
			try {
				const result = Reflect.apply(value, environment, args);
				return result instanceof Promise
					? result.catch((error) => {
							throw sandboxExecutionError(error, code);
						})
					: result;
			} catch (error) {
				throw sandboxExecutionError(error, code);
			}
		};
	} catch (error) {
		throw sandboxExecutionError(error, code);
	}
}

/** Async counterpart used by Plugin imports.  It shares the exact `{{ }}` / `[[ ]]`
 * semantics with the synchronous helper, but permits nested async imports. */
export async function resolveSandboxTextAsync(
	text: string,
	environments: SandboxEnvironment[] = [],
	options: ResolveTextOptions = {},
): Promise<string> {
	let current = text;
	const seen = new Set<string>();
	const maxDepth = options.maxDepth ?? defaultMaxDepth;
	for (let depth = 0; depth < maxDepth; depth += 1) {
		if (seen.has(current)) {
			options.logger?.append(
				"检测到宏展开循环，保留最后一次结果。",
				depth,
				"error",
			);
			return current;
		}
		seen.add(current);
		const next = await replaceInlineExpressionsAsync(
			current,
			environments,
			options,
		);
		options.logger?.append(`宏展开第 ${depth + 1} 轮。`, depth, "sandbox");
		if (next === current) return next;
		current = next;
	}
	options.logger?.append(`宏展开达到 ${maxDepth} 轮上限。`, maxDepth, "error");
	return current;
}

export async function resolveSandboxMessagesAsync(
	messages: ModelMessage[],
	environments: SandboxEnvironment[] = [],
	options: ResolveTextOptions = {},
): Promise<ModelMessage[]> {
	let current = messages.map((message) => ({ ...message }));
	const seen = new Set<string>();
	const maxDepth = options.maxDepth ?? defaultMaxDepth;
	for (let depth = 0; depth < maxDepth; depth += 1) {
		const serialized = JSON.stringify(current);
		if (seen.has(serialized)) {
			options.logger?.append(
				"检测到消息宏展开循环，保留最后一次结果。",
				depth,
				"error",
			);
			return current;
		}
		seen.add(serialized);
		const next = (
			await Promise.all(
				current.map((message) =>
					resolveMessageOnceAsync(message, environments, options),
				),
			)
		).flat();
		if (JSON.stringify(next) === serialized) return next;
		current = next;
	}
	options.logger?.append(
		`消息宏展开达到 ${maxDepth} 轮上限。`,
		maxDepth,
		"error",
	);
	return current;
}

async function replaceInlineExpressionsAsync(
	text: string,
	environments: SandboxEnvironment[],
	options: ResolveTextOptions,
) {
	const parts = splitInlineExpressions(text);
	let output = "";
	for (const part of parts) {
		output +=
			part.kind === "text"
				? part.value
				: stringifySandboxValue(
						await executeSandboxCodeAsync(part.value, environments),
						options,
					);
	}
	return output;
}

async function resolveMessageOnceAsync(
	message: ModelMessage,
	environments: SandboxEnvironment[],
	options: ResolveTextOptions,
): Promise<ModelMessage[]> {
	if (message.role === "tool" || typeof message.content !== "string")
		return [message];
	const create = (content: string): ModelMessage =>
		({ ...message, content }) as ModelMessage;
	const output: ModelMessage[] = [create("")];
	for (const part of splitInlineExpressions(message.content)) {
		const last = output[output.length - 1]!;
		if (part.kind === "text") {
			(last.content as string) += part.value;
			continue;
		}
		const value = await executeSandboxCodeAsync(part.value, environments);
		if (part.kind === "inline") {
			(last.content as string) += stringifySandboxValue(value, options);
			continue;
		}
		if (isModelMessageArray(value)) {
			output.push(...value, create(""));
			continue;
		}
		if (isStringArrayLike(value)) {
			output.push(
				...Array.from(value, (content) => create(String(content))),
				create(""),
			);
			continue;
		}
		(last.content as string) += stringifySandboxValue(value, options);
	}
	return output.filter(
		(item) => typeof item.content !== "string" || item.content.length > 0,
	);
}

function splitInlineExpressions(text: string) {
	const parts: { kind: "text" | "inline" | "splice"; value: string }[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(inlinePattern)) {
		if (match.index == null) {
			continue;
		}
		if (match.index > lastIndex) {
			parts.push({ kind: "text", value: text.slice(lastIndex, match.index) });
		}
		parts.push({
			kind: match[2] == null ? "splice" : "inline",
			value: match[2] ?? match[3] ?? "",
		});
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push({ kind: "text", value: text.slice(lastIndex) });
	}

	return parts;
}

function buildExecutableBody(
	code: string,
	environment: SandboxEnvironment,
): string {
	if (!code || /^(\/\/[^\n]*|\/\*[\s\S]*\*\/)\s*$/.test(code)) {
		return "return undefined;";
	}
	if (/^[A-Za-z_$][\w$]*$/.test(code)) {
		return typeof environment[code] === "function"
			? `return ${code}();`
			: `return ${code};`;
	}
	if (
		/^(async\s+)?function\b/.test(code) ||
		/^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(code)
	) {
		return `return (${code});`;
	}
	if (/^(if|for|while|switch|try|return|const|let|var)\b/.test(code)) {
		return code;
	}
	return `return (${code});`;
}

function sandboxExecutionError(error: unknown, code: string): Error {
	const marker = "[PulsarAI Sandbox source]";
	if (error instanceof Error && error.message.includes(marker)) return error;
	const message = error instanceof Error ? error.message : String(error);
	const codeFence = String.fromCharCode(96).repeat(3);
	const enriched = new Error(
		message +
			"\n\n" +
			marker +
			"\n\n" +
			codeFence +
			"js\n" +
			sandboxSourceExcerpt(code) +
			"\n" +
			codeFence,
	);
	if (error instanceof Error && error.stack) {
		enriched.stack = `${enriched.stack}\nCaused by: ${error.stack}`;
	}
	return enriched;
}

function sandboxSourceExcerpt(code: string) {
	const lines = code.replace(/\r\n/g, "\n").trim().split("\n");
	const visibleIndexes =
		lines.length > 80
			? [
					...Array.from({ length: 60 }, (_, index) => index),
					...Array.from(
						{ length: 20 },
						(_, index) => lines.length - 20 + index,
					),
				]
			: Array.from({ length: lines.length }, (_, index) => index);
	const width = String(lines.length).length;
	const result: string[] = [];
	let previousIndex = -1;
	for (const index of visibleIndexes) {
		if (index > previousIndex + 1) result.push("… omitted …");
		result.push(`${String(index + 1).padStart(width, " ")} | ${lines[index]}`);
		previousIndex = index;
	}
	return result.join("\n").slice(0, 8_000);
}

function stringifySandboxValue(
	value: unknown,
	options: ResolveTextOptions = {},
): string {
	if (value == null) {
		return "";
	}
	if (
		!options.keepArraySet2StrDefault &&
		(Array.isArray(value) || value instanceof Set)
	) {
		return Array.from(value, (item) => String(item))
			.map((item) => (item.endsWith("\n") ? item : `${item}\n`))
			.join("");
	}
	if (
		typeof value === "object" &&
		"toString" in value &&
		Object.prototype.hasOwnProperty.call(value, "toString")
	) {
		const customToString = (value as { toString: unknown }).toString;
		return typeof customToString === "function"
			? String(customToString.call(value))
			: String(customToString);
	}
	return String(value);
}

function isStringArrayLike(value: unknown): value is string[] | Set<string> {
	if (Array.isArray(value)) {
		return value.every((item) => typeof item === "string");
	}
	return (
		value instanceof Set &&
		Array.from(value).every((item) => typeof item === "string")
	);
}

function isModelMessageArray(value: unknown): value is ModelMessage[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				item && typeof item === "object" && "role" in item && "content" in item,
		)
	);
}
