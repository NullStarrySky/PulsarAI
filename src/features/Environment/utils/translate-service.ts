import { generateText } from "@/features/Request/ai-sdk";
import { modelProxyFetch } from "@/features/Request/provider/shared/custom-fetch";
import type { TranslateState } from "../defaults";

export async function translateWithLlm(
	text: string,
	state: TranslateState,
): Promise<string> {
	const prompt = `${state.prompt
		.split("{{sourceLanguage}}")
		.join(state.sourceLanguage)
		.split("{{targetLanguage}}")
		.join(state.targetLanguage)}

${text}`;
	if (!state.llmModel) throw new Error("尚未配置翻译模型。");
	const result = await generateText({ model: state.llmModel, prompt });
	return result.text;
}

export async function translateWithProvider(
	text: string,
	state: TranslateState,
): Promise<string> {
	if (!text.trim()) return "";
	if (state.provider === "microsoft") return translateWithAzure(text, state);

	const params = new URLSearchParams({
		client: "gtx",
		sl: state.sourceLanguage === "auto" ? "auto" : state.sourceLanguage,
		tl: state.targetLanguage,
		dt: "t",
		q: text,
	});
	let response: Response;
	try {
		response = await fetch(
			`https://translate.googleapis.com/translate_a/single?${params}`,
		);
	} catch {
		response = await modelProxyFetch(
			`https://translate.googleapis.com/translate_a/single?${params}`,
		);
	}
	if (!response.ok) {
		throw new Error(`Google Translate 请求失败 (${response.status})`);
	}
	const data = (await response.json()) as [Array<[string]>];
	return (data[0] ?? []).map((part) => part[0] ?? "").join("");
}

export async function translateWithAzure(
	text: string,
	state: TranslateState,
): Promise<string> {
	if (!state.azureKey.trim()) {
		throw new Error("请先填写 Azure Translator 密钥。");
	}

	const endpoint =
		state.azureEndpoint.trim().replace(/\/$/, "") ||
		"https://api.cognitive.microsofttranslator.com";
	const params = new URLSearchParams({
		"api-version": "3.0",
		to: state.targetLanguage,
	});
	if (state.sourceLanguage !== "auto") {
		params.set("from", state.sourceLanguage);
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"Ocp-Apim-Subscription-Key": state.azureKey,
	};
	if (state.azureRegion.trim()) {
		headers["Ocp-Apim-Subscription-Region"] = state.azureRegion.trim();
	}

	const response = await modelProxyFetch(`${endpoint}/translate?${params}`, {
		method: "POST",
		headers,
		body: JSON.stringify([{ text }]),
	});
	if (!response.ok) {
		throw new Error(`Azure Translator 请求失败 (${response.status})`);
	}
	const data = (await response.json()) as Array<{
		translations?: Array<{ text?: string }>;
	}>;
	return data[0]?.translations?.[0]?.text ?? "";
}
