import type { FileMeta, ResourcePath } from "../dataflow/types";

export interface ResourceFile extends FileMeta {
	path: ResourcePath;
	content: string;
}
