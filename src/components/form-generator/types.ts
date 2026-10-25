export type ControllerType =
	| "switch"
	| "select"
	| "slider"
	| "textarea"
	| "input";

export interface BaseSchemaItem {
	id: string; // key
	name: string;
	description?: string;
}

export interface SwitchController {
	type: "switch";
	value: boolean;
	default: boolean;
}

export interface SelectController {
	type: "select";
	value: string;
	default: string;
	options: string[];
}

export interface SliderController {
	type: "slider";
	value: number;
	default: number;
	min: number;
	max: number;
	step?: number;
}

export interface TextareaController {
	type: "textarea";
	value: string;
	default: string;
	placeholder?: string;
}

export interface InputController {
	type: "input";
	value: string;
	default: string;
	placeholder?: string;
}

export type SchemaController =
	| SwitchController
	| SelectController
	| SliderController
	| TextareaController
	| InputController;

export type SchemaItem = BaseSchemaItem & SchemaController;

export type FormSchema = SchemaItem[];

/** Round numeric value to match step precision and avoid 0.7000000000000001 floating point artifacts */
export function roundStep(value: number, step?: number): number {
	if (typeof value !== "number" || Number.isNaN(value)) return 0;
	if (!step || step <= 0) {
		return Math.round(value * 10000) / 10000;
	}
	const stepStr = step.toString();
	const decimals = stepStr.includes(".")
		? (stepStr.split(".")[1]?.length ?? 0)
		: 0;
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

/** Create a fresh controller template for the given type */
export function createDefaultController(
	type: ControllerType,
): SchemaController {
	switch (type) {
		case "switch":
			return {
				type: "switch",
				value: false,
				default: false,
			};
		case "select":
			return {
				type: "select",
				value: "option1",
				default: "option1",
				options: ["option1", "option2"],
			};
		case "slider":
			return {
				type: "slider",
				value: 0,
				default: 0,
				min: 0,
				max: 100,
				step: 1,
			};
		case "textarea":
			return {
				type: "textarea",
				value: "",
				default: "",
				placeholder: "请输入内容...",
			};
		case "input":
			return {
				type: "input",
				value: "",
				default: "",
				placeholder: "请输入...",
			};
	}
}

/** Create a complete SchemaItem with initial defaults */
export function createDefaultSchemaItem(
	id = "",
	name = "",
	type: ControllerType = "switch",
): SchemaItem {
	return {
		id,
		name: name || id,
		description: "",
		...createDefaultController(type),
	} as SchemaItem;
}

/** Clone a SchemaItem or FormSchema cleanly */
export function cloneSchema<T extends SchemaItem | FormSchema>(target: T): T {
	return JSON.parse(JSON.stringify(target));
}
