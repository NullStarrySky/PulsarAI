import {
	buildStImportPlan,
	type StImportPlan,
	type StResourceFile,
} from "./st-import-plan";

export type StTestRendererKind =
	| "worldbook"
	| "regex"
	| "character"
	| "preset"
	| "conversation";

export interface StTestRenderer {
	kind: StTestRendererKind;
	label: string;
	render(): { source: StResourceFile; plan: StImportPlan };
}

function jsonRenderer(
	kind: Exclude<StTestRendererKind, "conversation">,
	label: string,
	value: unknown,
): StTestRenderer {
	return {
		kind,
		label,
		render() {
			const source = {
				fileName: `test-${kind}.json`,
				text: JSON.stringify(value, null, 2),
			};
			return { source, plan: buildStImportPlan(source.fileName, source) };
		},
	};
}

export const stTestRenderers: StTestRenderer[] = [
	jsonRenderer("worldbook", "世界书", {
		entries: [
			{
				uid: 1,
				comment: "测试条目",
				key: ["Pulsar"],
				content: "Pulsar 是测试关键词。",
				enabled: true,
				position: 0,
			},
		],
	}),
	jsonRenderer("regex", "正则", [
		{
			scriptName: "测试正则",
			findRegex: "/foo/g",
			replaceString: "bar",
			placement: [1, 2],
			disabled: false,
		},
	]),
	jsonRenderer("character", "角色", {
		spec: "chara_card_v3",
		data: {
			name: "测试角色",
			description: "用于验证角色转换渲染。",
			first_mes: "你好。",
			alternate_greetings: [],
		},
	}),
	jsonRenderer("preset", "预设", {
		chat_completion_source: "openai",
		temperature: 1,
		prompts: [
			{
				identifier: "main",
				name: "主提示",
				role: "system",
				content: "你是测试助手。",
				enabled: true,
			},
		],
		prompt_order: [{ order: [{ identifier: "main", enabled: true }] }],
	}),
	{
		kind: "conversation",
		label: "对话",
		render() {
			const source = {
				fileName: "test-conversation.json",
				text: JSON.stringify(
					[
						{ name: "User", is_user: true, mes: "你好" },
						{
							name: "Assistant",
							is_user: false,
							mes: "你好，有什么可以帮你？",
						},
					],
					null,
					2,
				),
			};
			return {
				source,
				plan: {
					kind: "conversation",
					name: "test-conversation",
					mode: "file",
					files: [
						{
							path: "conversation.chat.json",
							content: {
								message: [
									{ role: "user", content: "你好" },
									{ role: "assistant", content: "你好，有什么可以帮你？" },
								],
							},
						},
					],
					diagnostics: [],
				},
			};
		},
	},
];
