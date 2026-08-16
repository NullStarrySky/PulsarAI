export function parseUriPath(rawPath: string, currentPluginId: string) {
  const trimmed = rawPath.trim();
  if (trimmed === "@" || trimmed === "" || trimmed === "@/") {
    return { targetPluginId: currentPluginId, relPath: "", isPluginRoot: true };
  }
  if (trimmed.startsWith("@/")) {
    return {
      targetPluginId: currentPluginId,
      relPath: trimmed.slice(2),
      isPluginRoot: trimmed.slice(2).trim() === "",
    };
  }
  if (trimmed.startsWith("@")) {
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx < 0) {
      const pluginId = trimmed.slice(1);
      return { targetPluginId: pluginId, relPath: "", isPluginRoot: true };
    }
    const pluginId = trimmed.slice(1, slashIdx);
    const rel = trimmed.slice(slashIdx + 1);
    return { targetPluginId: pluginId, relPath: rel, isPluginRoot: rel.trim() === "" };
  }
  return { targetPluginId: currentPluginId, relPath: trimmed, isPluginRoot: trimmed === "" };
}

export function normalizePath(path: string) {
  const parts = path.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) throw new Error("路径不能跨出插件根目录。");
  return parts;
}

export function resolveRelativePluginPath(directory: string[], path: string) {
  const resolved = [...directory];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!resolved.length) throw new Error("路径不能跨出插件根目录。");
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join("/");
}

export function globMatcher(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
