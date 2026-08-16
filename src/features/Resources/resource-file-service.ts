import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export async function saveImageFile(file: File) {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const extension = file.name.split(".").pop() || "png";
  return invoke<string>("resource_save_image", { bytes, extension });
}

export function deleteResourceFile(fileUrl: string) {
  return invoke<void>("resource_delete_file", { fileUrl });
}

export function resourceDisplayUrl(fileUrl?: string) {
  if (!fileUrl) {
    return "";
  }

  return convertFileSrc(fileUrl.replace(/^file:\/\//, ""));
}
