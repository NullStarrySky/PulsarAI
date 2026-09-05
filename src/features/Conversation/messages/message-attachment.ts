import type { FilePart } from "@/features/Conversation/messages/message-types";

export async function fileToMessagePart(file: File): Promise<FilePart> {
	return {
		type: "file",
		url: await readFileAsDataUrl(file),
		filename: file.name,
		mediaType: file.type || "application/octet-stream",
		size: file.size,
	};
}

export function attachmentPreviewUrl(part: FilePart) {
	return part.mediaType.startsWith("image/") ? part.url : "";
}

export async function openMessageAttachment(part: FilePart) {
	const source = part.url;
	const response = await fetch(source);
	const blob = await response.blob();
	const objectUrl = URL.createObjectURL(blob);
	const previewable =
		part.mediaType.startsWith("image/") ||
		part.mediaType.startsWith("text/") ||
		part.mediaType === "application/pdf";

	if (previewable) {
		window.open(objectUrl, "_blank", "noopener,noreferrer");
	} else {
		const anchor = document.createElement("a");
		anchor.href = objectUrl;
		anchor.download = part.filename || "attachment";
		anchor.click();
	}

	window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function formatAttachmentSize(size?: number) {
	if (size == null || !Number.isFinite(size)) {
		return "";
	}
	if (size < 1024) {
		return `${size} B`;
	}
	if (size < 1024 * 1024) {
		return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
	}
	return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function readFileAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () =>
			reject(reader.error ?? new Error(`无法读取文件：${file.name}`));
		reader.onload = () => {
			resolve(typeof reader.result === "string" ? reader.result : "");
		};
		reader.readAsDataURL(file);
	});
}
