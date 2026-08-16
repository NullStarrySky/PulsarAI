export type PluginMediaType = "image" | "video";

export interface PluginMediaContent {
  kind: "media";
  url: string;
  mediaType?: PluginMediaType;
}

export function pluginMediaSource(content: unknown) {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!content || typeof content !== "object") {
    return "";
  }
  const source = content as { url?: unknown; src?: unknown; value?: unknown };
  const value = source.url ?? source.src ?? source.value;
  return typeof value === "string" ? value.trim() : "";
}

export function pluginMediaType(content: unknown, source = pluginMediaSource(content)): PluginMediaType {
  if (content && typeof content === "object") {
    const explicit = (content as { mediaType?: unknown }).mediaType;
    if (explicit === "video" || explicit === "image") {
      return explicit;
    }
  }

  const normalized = source.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  return normalized.startsWith("data:video/")
    || /\.(mp4|webm|ogv|ogg|mov|m4v)$/.test(normalized)
    ? "video"
    : "image";
}

export function createPluginMediaContent(
  url = "",
  mediaType?: PluginMediaType,
): PluginMediaContent {
  return {
    kind: "media",
    url,
    mediaType: mediaType ?? pluginMediaType(url),
  };
}
