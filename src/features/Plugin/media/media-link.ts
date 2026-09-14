import { host } from "@/host";

const prefix = "media://";

export function mediaLink(id: string) {
	return `${prefix}${id}`;
}

function mediaIdFromLink(value: string) {
	return value.startsWith(prefix) ? value.slice(prefix.length) : "";
}

export function mediaLinks(value: string) {
	return [...value.matchAll(/media:\/\/([0-9a-f-]{36})/gi)].map((match) =>
		mediaLink(match[1]!),
	);
}

export function isTextMediaType(mediaType: string) {
	return (
		/^text\//i.test(mediaType) ||
		/^application\/(json|xml|javascript)$/i.test(mediaType)
	);
}

export async function writeMedia(
	bytes: Uint8Array,
	mediaType: string,
	path?: string,
) {
	return host.media.write({
		bytes: [...bytes],
		mediaType,
		...(path ? { path } : {}),
	});
}

export async function readMediaLink(value: string) {
	const id = mediaIdFromLink(value);
	if (!id) return null;
	const file = await host.media.read(id);
	return { ...file, bytes: Uint8Array.from(file.bytes) };
}

export async function resolveMediaUrl(value: string) {
	const id = mediaIdFromLink(value);
	return id ? host.media.url(id) : value;
}

export async function removeMediaLink(value: string) {
	const id = mediaIdFromLink(value);
	if (id) await host.media.remove(id);
}
