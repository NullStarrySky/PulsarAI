import { push } from "notivue";
import { z } from "zod";
import { createSandboxFunction } from "@/features/Sandbox/sandbox";

export type PluginDataValue =
	| string
	| number
	| boolean
	| null
	| PluginDataValue[]
	| { [key: string]: PluginDataValue };

const valueSchema: z.ZodType<PluginDataValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(valueSchema),
		z.record(z.string(), valueSchema),
	]),
);
const dataSchema = z.object({
	version: z.literal(1).default(1),
	isolation: z.enum(["resource", "conversation"]).default("resource"),
	initialValue: valueSchema.default({}),
	enableUpdater: z.boolean().default(false),
	wrapperSource: z.string().default(""),
	varName: z.string().optional(),
});

export type PluginDataDefinition = z.infer<typeof dataSchema>;

const fallback: PluginDataDefinition = {
	version: 1,
	isolation: "resource",
	initialValue: {},
	enableUpdater: false,
	wrapperSource: "",
};

export function createPluginDataDefinition(): PluginDataDefinition {
	return structuredClone(fallback);
}

/** Data is the sole resource type that gains an object facade on import. */
export function parsePluginDataDefinition(
	input: unknown,
): PluginDataDefinition {
	let value = input;
	if (typeof input === "string") {
		try {
			value = JSON.parse(input);
		} catch {
			push.warning(".data.json 不是合法 JSON，已使用空数据。");
			return structuredClone(fallback);
		}
	}
	const parsed = dataSchema.safeParse(value);
	if (!parsed.success) {
		push.warning(".data.json 类型无效，已使用空数据。");
		return structuredClone(fallback);
	}
	return parsed.data;
}

export function createDataFacade(
	definition: Pick<PluginDataDefinition, "wrapperSource"> & { name: string },
	value: PluginDataValue,
	options: {
		readonly?: boolean;
		onReplace?: (value: PluginDataValue) => void;
	} = {},
) {
	let current = options.readonly ? deepFreeze(structuredClone(value)) : value;
	if (!definition.wrapperSource.trim()) return current;
	const facade = createSandboxFunction(definition.wrapperSource, [])(current, {
		get value() {
			return current;
		},
		replace(next: PluginDataValue) {
			if (options.readonly)
				throw new Error(`${definition.name} 在当前上下文中是只读变量。`);
			current = structuredClone(next);
			options.onReplace?.(current);
		},
	});
	if (!facade || typeof facade !== "object")
		throw new Error(`${definition.name} 的 wrapper 必须返回对象。`);
	return options.readonly ? Object.freeze(facade) : facade;
}

function deepFreeze<T extends PluginDataValue>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value))
		return value;
	Object.values(value).forEach((child) => {
		deepFreeze(child as PluginDataValue);
	});
	return Object.freeze(value);
}
