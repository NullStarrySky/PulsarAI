const TOKENIZED_TEXT_FILE =
	/(?:\.(?:md|txt|json|js|ts|vue|css|html|xml|ya?ml|toml)|(?:^|\/)AGENTS\.md)$/i;

let encoderPromise: Promise<import("tiktoken").Tiktoken> | null = null;

export function supportsReferenceTokenEstimate(path: string) {
	return TOKENIZED_TEXT_FILE.test(path);
}

export async function estimateReferenceTokens(path: string, content: string) {
	if (!supportsReferenceTokenEstimate(path)) return null;
	encoderPromise ??= import("tiktoken").then(({ get_encoding }) =>
		get_encoding("cl100k_base"),
	);
	return (await encoderPromise).encode(content).length;
}
