import type { DataContent, FilePart } from "@/features/Resources/Conversation/messages/conversation-types";

export async function fileToMessagePart(file: File): Promise<FilePart> {
  return {
    type: "file",
    data: await readFileAsBase64(file),
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export function attachmentDataUrl(part: FilePart) {
  if (part.data instanceof URL) {
    return part.data.toString();
  }
  if (typeof part.data === "string") {
    if (/^(data:|https?:|file:|blob:)/i.test(part.data)) {
      return part.data;
    }
    return `data:${part.mediaType};base64,${part.data}`;
  }
  return `data:${part.mediaType};base64,${dataContentToBase64(part.data)}`;
}

export function attachmentPreviewUrl(part: FilePart) {
  return part.mediaType.startsWith("image/") ? attachmentDataUrl(part) : "";
}

export async function openMessageAttachment(part: FilePart) {
  const source = attachmentDataUrl(part);
  const response = await fetch(source);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const previewable =
    part.mediaType.startsWith("image/")
    || part.mediaType.startsWith("text/")
    || part.mediaType === "application/pdf";

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

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`无法读取文件：${file.name}`));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      resolve(separator >= 0 ? result.slice(separator + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function dataContentToBase64(data: Exclude<DataContent, string>) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
