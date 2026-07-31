import type {
  CapabilityApiDoc,
  CapabilityDefinition,
  CapabilityHumanDocumentation,
  CapabilityTypeDoc,
} from "./capability";

export interface CapabilityMarkdownOutlineItem {
  id: string;
  label: string;
  children: Array<{
    id: string;
    label: string;
  }>;
}

export interface CapabilityMarkdownFeature {
  definition: CapabilityDefinition;
  documentation: CapabilityHumanDocumentation;
  id: string;
  notesId: string;
  typesId: string;
  apiId: string;
  permissionGroups: Array<{
    id: string;
    title: string;
    functions: CapabilityApiDoc[];
  }>;
}

export interface CapabilityMarkdownDocument {
  title: string;
  introduction: string;
  markdown: string;
  outline: CapabilityMarkdownOutlineItem[];
  features: CapabilityMarkdownFeature[];
}

const documentTitle = "Pulsar Feature API";
const documentIntroduction =
  "本文档由各 Feature 的 capabilities 定义自动生成，说明可用场景、关键类型、权限边界与公开 API。";

export function createCapabilityMarkdownDocument(
  definitions: CapabilityDefinition[],
): CapabilityMarkdownDocument {
  const features = definitions
    .filter(
      (definition): definition is CapabilityDefinition & {
        documentation: CapabilityHumanDocumentation;
      } => Boolean(definition.documentation),
    )
    .map(createMarkdownFeature);

  return {
    title: documentTitle,
    introduction: documentIntroduction,
    markdown: [
      `# ${documentTitle}`,
      "",
      documentIntroduction,
      "",
      ...features.flatMap(featureToMarkdown),
    ].join("\n"),
    outline: features.map((feature) => ({
      id: feature.id,
      label: feature.definition.title,
      children: [
        ...(feature.definition.documentation?.notes?.length
          ? [{ id: feature.notesId, label: "使用说明" }]
          : []),
        ...(feature.definition.documentation?.types?.length
          ? [{ id: feature.typesId, label: "类型" }]
          : []),
        { id: feature.apiId, label: "API 定义" },
      ],
    })),
    features,
  };
}

function createMarkdownFeature(
  definition: CapabilityDefinition & {
    documentation: CapabilityHumanDocumentation;
  },
): CapabilityMarkdownFeature {
  const id = `feature-${definition.id}`;
  return {
    definition,
    documentation: definition.documentation,
    id,
    notesId: `${id}-notes`,
    typesId: `${id}-types`,
    apiId: `${id}-api`,
    permissionGroups: Object.keys(definition.subCaps)
      .filter((subCapId) => subCapId !== "all")
      .map((subCapId) => ({
        id: subCapId,
        title: definition.subCaps[subCapId] ?? subCapId,
        functions: definition.api[subCapId] ?? [],
      })),
  };
}

function featureToMarkdown(feature: CapabilityMarkdownFeature) {
  const { definition } = feature;
  const { documentation } = feature;

  const sections = [
    `<a id="${feature.id}"></a>`,
    `## ${definition.title}`,
    "",
    `API 对象：\`environment.${definition.id}\``,
    "",
    definition.description,
    "",
    documentation.overview,
    "",
  ];

  if (documentation.notes?.length) {
    sections.push(
      `<a id="${feature.notesId}"></a>`,
      "### 使用说明",
      "",
      ...documentation.notes.map((note) => `- ${note}`),
      "",
    );
  }

  if (documentation.types?.length) {
    sections.push(
      `<a id="${feature.typesId}"></a>`,
      "### 类型",
      "",
      ...documentation.types.flatMap(typeToMarkdown),
    );
  }

  sections.push(
    `<a id="${feature.apiId}"></a>`,
    "### API 定义",
    "",
    "#### 权限",
    "",
    "| 权限标识 | 说明 |",
    "| --- | --- |",
    ...Object.entries(definition.subCaps).map(
      ([id, description]) =>
        `| \`${escapeTableCell(id)}\` | ${escapeTableCell(description)} |`,
    ),
    "",
  );

  for (const permission of feature.permissionGroups) {
    sections.push(
      `#### ${permission.title}`,
      "",
      `权限标识：\`${permission.id}\``,
      "",
    );
    if (permission.functions.length === 0) {
      sections.push("此权限没有单独公开的函数。", "");
      continue;
    }
    sections.push(...permission.functions.flatMap((item) =>
      apiToMarkdown(definition.id, item)));
  }

  return sections;
}

function typeToMarkdown(type: CapabilityTypeDoc) {
  return [
    `#### ${type.name}`,
    "",
    ...(type.description ? [type.description, ""] : []),
    "```ts",
    type.definition,
    "```",
    "",
  ];
}

function apiToMarkdown(featureId: string, item: CapabilityApiDoc) {
  return [
    `##### \`${featureId}.${item.signature}\``,
    "",
    item.description,
    "",
    ...(item.returns ? [`**返回：** ${item.returns}`, ""] : []),
    ...(item.example
      ? ["**示例：**", "", "```js", item.example, "```", ""]
      : []),
  ];
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
