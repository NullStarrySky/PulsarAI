import { selectAll, upsert } from "@/features/Database/database-service";
import type { ModelProviderDefinition } from "../model-provider";

const table = "model_connection_providers";

export async function loadPersistedProviders() {
	return (await selectAll<ModelProviderDefinition>(table)).map(
		(record) => record.value,
	);
}

export async function persistProvider(provider: ModelProviderDefinition) {
	const persisted = JSON.parse(
		JSON.stringify(provider),
	) as ModelProviderDefinition;
	await upsert(table, persisted.id, persisted);
}
