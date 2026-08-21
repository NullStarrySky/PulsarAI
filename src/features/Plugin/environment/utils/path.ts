export function normalizePluginPath(value: string) {
  return value.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

export function resolvePluginPath(fromPath: string, request: string) {
  if (request.startsWith("@")) return request;
  const parent = fromPath.split("/").slice(0, -1);
  for (const part of request.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parent.pop(); else parent.push(part);
  }
  return `@/${normalizePluginPath(parent.join("/"))}`;
}
