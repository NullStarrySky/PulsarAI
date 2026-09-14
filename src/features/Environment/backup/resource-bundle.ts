import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ResourceArchivePayload } from "./backup-store";

const format = "pulsarai.resource-folder.v1";
type BundleManifest = {
	format: typeof format;
	rootType: ResourceArchivePayload["rootType"];
	rootId: string;
	entry: string;
	files: string[];
};
export type ResourceBundleFiles = Record<string, number[]>;

function folderName(payload: ResourceArchivePayload) {
	return `${payload.rootType}-${payload.rootId}`.replace(/[\\/:*?"<>|]/g, "_");
}

export function createResourceBundle(
	payload: ResourceArchivePayload,
): Uint8Array {
	const root = folderName(payload);
	const files: Record<string, Uint8Array> = {};
	const add = (name: string, value: unknown) => {
		files[`${root}/${name}`] = strToU8(JSON.stringify(value, null, 2));
	};
	add("local-plugins.json", payload.snapshot.localPlugins);
	add("worlds.json", payload.snapshot.worlds);
	add("conversations.json", payload.snapshot.conversations);
	add("message-containers.json", payload.snapshot.containers);
	const manifest: BundleManifest = {
		format,
		rootType: payload.rootType,
		rootId: payload.rootId,
		entry: "manifest.json",
		files: Object.keys(files).map((key) => key.slice(root.length + 1)),
	};
	add("manifest.json", manifest);
	return zipSync(files, { level: 6 });
}

export function readResourceBundle(
	input: Uint8Array | ResourceBundleFiles,
): ResourceArchivePayload {
	const files =
		input instanceof Uint8Array
			? unzipSync(input)
			: Object.fromEntries(
					Object.entries(input).map(([key, value]) => [
						key,
						Uint8Array.from(value),
					]),
				);
	const manifestPath = Object.keys(files).find(
		(path) => path.endsWith("/manifest.json") || path === "manifest.json",
	);
	if (!manifestPath) throw new Error("导入文件夹缺少 manifest.json。");
	const prefix = manifestPath.slice(0, -"manifest.json".length);
	const read = <T>(name: string): T => {
		const bytes = files[`${prefix}${name}`];
		if (!bytes) throw new Error(`导入文件夹缺少 ${name}。`);
		return JSON.parse(strFromU8(bytes)) as T;
	};
	const manifest = read<BundleManifest>("manifest.json");
	if (manifest.format !== format) throw new Error("不是 PulsarAI 资源文件夹。");
	return {
		rootType: manifest.rootType,
		rootId: manifest.rootId,
		snapshot: {
			localPlugins: read("local-plugins.json"),
			worlds: read("worlds.json"),
			conversations: read("conversations.json"),
			containers: read("message-containers.json"),
		},
	};
}
