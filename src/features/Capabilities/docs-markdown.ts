import type {
  FeatureApiDoc,
  FeatureDocs,
  FeatureDocsDetail,
  FeatureTypeDoc,
} from "./types";

export interface DocsMarkdownOutlineItem {
  id: string;
  label: string;
  children: Array<{
    id: string;
    label: string;
  }>;
}

export interface DocsMarkdownFeature {
  docs: FeatureDocs;
  documentation: FeatureDocsDetail;
  id: string;
  notesId: string;
  typesId: string;
  apiId: string;
  apiFunctions: FeatureApiDoc[];
}

export interface DocsMarkdownDocument {
  title: string;
  introduction: string;
  markdown: string;
  outline: DocsMarkdownOutlineItem[];
  features: DocsMarkdownFeature[];
}

const documentTitle = "Pulsar Feature API";
const documentIntroduction =
  "本文档由各 Feature 的 docs.ts 定义自动生成，说明可用场景、关键类型与公开 API。";

export function createDocsMarkdownDocument(
  docsList: FeatureDocs[],
): DocsMarkdownDocument {
  const features = docsList
    .filter(
      (docs): docs is FeatureDocs & { documentation: FeatureDocsDetail } =>
        Boolean(docs.documentation),
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
      label: feature.docs.title,
      children: [
        ...(feature.docs.documentation?.notes?.length
          ? [{ id: feature.notesId, label: "使用说明" }]
          : []),
        ...(feature.docs.documentation?.types?.length
          ? [{ id: feature.typesId, label: "类型" }]
          : []),
        { id: feature.apiId, label: "API 定义" },
      ],
    })),
    features,
  };
}

function createMarkdownFeature(
  docs: FeatureDocs & { documentation: FeatureDocsDetail },
): DocsMarkdownFeature {
  const id = `feature-${docs.id}`;
  return {
    docs,
    documentation: docs.documentation,
    id,
    notesId: `${id}-notes`,
    typesId: `${id}-types`,
    apiId: `${id}-api`,
    apiFunctions: docs.api,
  };
}

function featureToMarkdown(feature: DocsMarkdownFeature) {
  const { docs, documentation } = feature;

  const sections = [
    `<a id="${feature.id}"></a>`,
    `## ${docs.title}`,
    "",
    `API 对象：\`environment.${docs.id}\``,
    "",
    docs.description,
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
  );

  if (feature.apiFunctions.length === 0) {
    sections.push("此 Feature 没有单独公开的函数。", "");
  } else {
    sections.push(...feature.apiFunctions.flatMap((item) =>
      apiToMarkdown(docs.id, item)));
  }

  return sections;
}

function typeToMarkdown(type: FeatureTypeDoc) {
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

function apiToMarkdown(featureId: string, item: FeatureApiDoc) {
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
