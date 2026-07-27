export type CapabilityGrants = Record<string, string[]>;

export interface CapabilityApiDoc {
  name: string;
  signature: string;
  description: string;
  returns?: string;
  example?: string;
}

export interface CapabilityDefinition {
  id: string;
  title: string;
  description: string;
  subCaps: Record<string, string>;
  api: Record<string, CapabilityApiDoc[]>;
}

export type CapabilityBuilder<T extends Record<string, unknown> = Record<string, unknown>> =
  (subCapIds: string[]) => [T, string];

export interface CapabilityModule<T extends Record<string, unknown> = Record<string, unknown>> {
  capabilities: CapabilityDefinition;
  builder: CapabilityBuilder<T>;
}

export interface CapabilityRuntime {
  environment: Record<string, unknown>;
  prompt: string;
  grants: CapabilityGrants;
}

export function normalizeSubCapIds(
  definition: CapabilityDefinition,
  subCapIds: string[],
) {
  const available = Object.keys(definition.subCaps).filter((id) => id !== "all");
  const requested = new Set(subCapIds);
  return requested.has("all")
    ? available
    : available.filter((id) => requested.has(id));
}

export function createCapabilityBuilder<T extends Record<string, unknown>>(
  definition: CapabilityDefinition,
  createApi: (subCapIds: Set<string>) => T,
): CapabilityBuilder<T> {
  return (subCapIds) => {
    const normalized = normalizeSubCapIds(definition, subCapIds);
    return [
      createApi(new Set(normalized)),
      createCapabilityPrompt(definition, normalized),
    ];
  };
}

export function createCapabilityPrompt(
  definition: CapabilityDefinition,
  grantedSubCapIds: string[],
) {
  if (grantedSubCapIds.length === 0) {
    return "";
  }

  const sections = grantedSubCapIds.flatMap((subCapId) => {
    const docs = definition.api[subCapId] ?? [];
    if (docs.length === 0) {
      return [];
    }
    const lines = docs.map((item) => {
      const details = [
        `- \`${definition.id}.${item.signature}\`：${item.description}`,
        item.returns ? `  返回：${item.returns}` : "",
        item.example ? `  示例：\`${item.example}\`` : "",
      ].filter(Boolean);
      return details.join("\n");
    });
    return [
      `### ${definition.subCaps[subCapId] ?? subCapId}（${subCapId}）`,
      ...lines,
    ];
  });

  if (sections.length === 0) {
    return "";
  }

  return [
    `## ${definition.title} API（environment.${definition.id}）`,
    definition.description,
    ...sections,
  ].join("\n");
}

export function createMetadataOnlyCapability(
  definition: CapabilityDefinition,
): CapabilityModule {
  return {
    capabilities: definition,
    builder: createCapabilityBuilder(definition, () => ({})),
  };
}
