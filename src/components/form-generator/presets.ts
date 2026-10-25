import type { FormSchema } from "./types";

/**
 * 预定义的模型配置 Schema（典型大语言模型参数）
 */
export const defaultModelSchema: FormSchema = [
	{
		id: "temperature",
		name: "Temperature (采样温度)",
		description:
			"控制输出的随机性。值越低回答越聚焦和确定，值越高回答越发散和富有创造性。",
		type: "slider",
		value: 0.7,
		default: 0.7,
		min: 0,
		max: 2,
		step: 0.05,
	},
	{
		id: "top_p",
		name: "Top P (核采样)",
		description:
			"控制词元候选集的累积概率阈值。推荐不要与 Temperature 同时大幅调整。",
		type: "slider",
		value: 0.95,
		default: 0.95,
		min: 0,
		max: 1,
		step: 0.01,
	},
	{
		id: "max_tokens",
		name: "Max Tokens (单次最大长度)",
		description: "限制单次生成输出的最大 Token 数量。",
		type: "slider",
		value: 4096,
		default: 4096,
		min: 256,
		max: 16384,
		step: 256,
	},
	{
		id: "stream",
		name: "流式输出 (Stream)",
		description:
			"开启后将以打字机模式实时返回生成内容，提供更低的首次响应延迟。",
		type: "switch",
		value: true,
		default: true,
	},
	{
		id: "reasoning_effort",
		name: "Reasoning Effort (思考深度)",
		description:
			"针对支持思考模式的模型（如 o1/o3/Claude 3.7），控制推理预算与步骤详细度。",
		type: "select",
		value: "medium",
		default: "medium",
		options: ["low", "medium", "high", "auto"],
	},
	{
		id: "system_prompt",
		name: "System Prompt (系统提示词)",
		description: "设定模型的角色定位、专业领域、交互风格与硬性约束。",
		type: "textarea",
		value: "你是一个专业、严谨且注重细节的 AI 助手。",
		default: "你是一个专业、严谨且注重细节的 AI 助手。",
		placeholder: "输入系统提示词设定...",
	},
	{
		id: "presence_penalty",
		name: "Presence Penalty (存在惩罚)",
		description:
			"正值会根据新词元是否在已有文本中出现对其进行惩罚，增加谈论新主题的可能性。",
		type: "slider",
		value: 0,
		default: 0,
		min: -2,
		max: 2,
		step: 0.1,
	},
];

/**
 * 图像生成模型预设 Schema
 */
export const imageModelSchema: FormSchema = [
	{
		id: "sampler",
		name: "采样算法 (Sampler)",
		description: "生成扩散过程所使用的步进求解器。",
		type: "select",
		value: "DPM++ 2M Karras",
		default: "DPM++ 2M Karras",
		options: ["Euler a", "DPM++ 2M Karras", "DPM++ SDE Karras", "DDIM"],
	},
	{
		id: "steps",
		name: "迭代步数 (Steps)",
		description: "生成过程中的去噪步数。",
		type: "slider",
		value: 28,
		default: 28,
		min: 10,
		max: 60,
		step: 1,
	},
	{
		id: "cfg_scale",
		name: "CFG 提示词相关度",
		description: "控制生成图像贴近提示词的程度。",
		type: "slider",
		value: 7,
		default: 7,
		min: 1,
		max: 20,
		step: 0.5,
	},
	{
		id: "negative_prompt",
		name: "负面提示词 (Negative Prompt)",
		description: "指定生成时应避免出现的元素。",
		type: "textarea",
		value: "low quality, blurry, distorted, watermark",
		default: "low quality, blurry, distorted, watermark",
		placeholder: "输入希望避免的内容...",
	},
];
