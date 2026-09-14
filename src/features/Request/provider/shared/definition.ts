import type { ParamDefinition, Provider } from "../../types";

export function param(
	paramName: string,
	value: unknown,
	title?: string,
	enableInDefault = false,
): ParamDefinition {
	return {
		paramName,
		title,
		enableInDefault,
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: value,
		value,
	};
}

export function secret(name: string, title: string): ParamDefinition {
	return {
		...param("", "", title),
		customBlockComponent: "SecretInput",
		paramComponent: { component: "secret", componentParam: { name } },
	};
}

export function emptyModels(): Provider["models"] {
	return { text: [], image: [], video: [], speech: [], transcribe: [] };
}
