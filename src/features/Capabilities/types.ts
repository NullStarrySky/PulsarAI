export interface FeatureApiDoc {
  name: string;
  signature: string;
  description: string;
  returns?: string;
  example?: string;
}

export interface FeatureTypeDoc {
  name: string;
  description?: string;
  definition: string;
}

export interface FeatureDocsDetail {
  overview: string;
  notes?: string[];
  types?: FeatureTypeDoc[];
}

/**
 * 一个 Feature 的公开 API 文档元数据。只包含说明数据，
 * 不引入任何运行时依赖，供 read_docs 与文档生成共同消费。
 */
export interface FeatureDocs {
  id: string;
  title: string;
  description: string;
  documentation?: FeatureDocsDetail;
  api: FeatureApiDoc[];
}

export type FeatureApiAvailability = "available" | "blocked";

export interface FeatureDocsEntry {
  id: string;
  title: string;
  description: string;
}

export interface FeatureApiDocResult extends FeatureApiDoc {
  availability: FeatureApiAvailability;
  reason?: string;
}

export interface FeatureDocsResult extends Omit<FeatureDocs, "api"> {
  api: FeatureApiDocResult[];
}

export type ReadDocsResult =
  | FeatureDocsEntry[]
  | FeatureDocsResult
  | FeatureApiDocResult
  | null;

export interface FeatureApiRuntime {
  environment: Record<string, unknown>;
  prompt: string;
}
