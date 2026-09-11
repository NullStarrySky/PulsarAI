import { computed, type MaybeRef, unref } from "vue";
import { useSyncStore } from "@/features/Database/dbsync-store";
import {
	isTextMediaType,
	mediaLink,
	resolveMediaUrl,
	writeMedia,
} from "@/features/Media/media-link";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer, FilePart, ReferencePart } from "../types";

export function useContainerAttachments(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const container = computed(() => unref(source));
	const message = computed(() => currentMessage(container.value));
	const files = computed(() =>
		(message.value?.parts ?? []).filter(
			(part): part is FilePart => part.type === "file",
		),
	);
	const references = computed(() =>
		(message.value?.parts ?? []).filter(
			(part): part is ReferencePart => part.type === "reference",
		),
	);
	function markDirty() {
		if (container.value)
			useSyncStore().markDirty({ type: "container", id: container.value.id });
	}
	async function fromFile(file: File): Promise<FilePart> {
		const mediaType = file.type || "application/octet-stream";
		const url = isTextMediaType(mediaType)
			? await readAsDataUrl(file)
			: mediaLink(
					(
						await writeMedia(
							new Uint8Array(await file.arrayBuffer()),
							mediaType,
							"attachments",
						)
					).id,
				);
		return {
			type: "file",
			url,
			filename: file.name,
			mediaType,
			size: file.size,
		};
	}
	function add(part: FilePart | ReferencePart) {
		if (!message.value) return;
		message.value.parts ??= [];
		message.value.parts.push(part);
		markDirty();
	}
	function remove(id: string) {
		if (!message.value) return;
		message.value.parts = message.value.parts?.filter((part) =>
			part.type === "file" ? part.url !== id : part.id !== id,
		);
		markDirty();
	}
	async function preview(part: FilePart) {
		return part.mediaType.startsWith("image/") ? resolveMediaUrl(part.url) : "";
	}
	async function open(part: FilePart) {
		const source = await resolveMediaUrl(part.url);
		const blob = await (await fetch(source)).blob();
		const url = URL.createObjectURL(blob);
		if (
			part.mediaType.startsWith("image/") ||
			part.mediaType.startsWith("text/") ||
			part.mediaType === "application/pdf"
		)
			window.open(url, "_blank", "noopener,noreferrer");
		else {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = part.filename || "attachment";
			anchor.click();
		}
		window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
	}
	function formatSize(size?: number) {
		if (size == null || !Number.isFinite(size)) return "";
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024)
			return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
		return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
	}
	return {
		files,
		references,
		fromFile,
		add,
		remove,
		preview,
		open,
		formatSize,
	};
}

function readAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error(`无法读取文件：${file.name}`));
		reader.onload = () =>
			resolve(typeof reader.result === "string" ? reader.result : "");
		reader.readAsDataURL(file);
	});
}
