import { selectAll, upsert } from "@/features/Database/application/database-service";
import type { ModelProviderDefinition } from "../domain/model-provider";

const table = "model_connection_providers";

export async function loadPersistedProviders() {
  return (await selectAll<ModelProviderDefinition>(table)).map((record) => record.value);
}

export async function persistProvider(provider: ModelProviderDefinition) {
  await upsert(table, provider.id, provider);
}
