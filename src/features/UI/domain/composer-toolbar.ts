export const composerToolDefinitions = [
  { id: "model", label: "模型" },
  { id: "attachment", label: "附加文件" },
  { id: "whiteboard", label: "白板" },
  { id: "fullscreen", label: "全屏输入" },
] as const;

export type ComposerToolId = typeof composerToolDefinitions[number]["id"];
export type ComposerToolbarZone = "left" | "right" | "unused";

export interface ComposerToolbarLayout {
  left: ComposerToolId[];
  right: ComposerToolId[];
  unused: ComposerToolId[];
}

export const defaultComposerToolbarLayout: ComposerToolbarLayout = {
  left: ["model", "attachment"],
  right: ["whiteboard", "fullscreen"],
  unused: [],
};

const toolIds = new Set<ComposerToolId>(
  composerToolDefinitions.map((item) => item.id),
);

export function normalizeComposerToolbarLayout(
  input?: Partial<ComposerToolbarLayout>,
): ComposerToolbarLayout {
  const seen = new Set<ComposerToolId>();
  const normalizeZone = (values?: ComposerToolId[]) =>
    (values ?? []).filter((id) => {
      if (!toolIds.has(id) || seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });

  const layout: ComposerToolbarLayout = {
    left: normalizeZone(input?.left),
    right: normalizeZone(input?.right),
    unused: normalizeZone(input?.unused),
  };
  for (const definition of composerToolDefinitions) {
    if (!seen.has(definition.id)) {
      const defaultZone = defaultComposerToolbarLayout.left.includes(definition.id)
        ? "left"
        : defaultComposerToolbarLayout.right.includes(definition.id)
          ? "right"
          : "unused";
      layout[defaultZone].push(definition.id);
    }
  }
  return layout;
}

export function moveComposerTool(
  layout: ComposerToolbarLayout,
  toolId: ComposerToolId,
  target: ComposerToolbarZone,
  beforeId?: ComposerToolId,
) {
  const next = normalizeComposerToolbarLayout(layout);
  for (const zone of ["left", "right", "unused"] as const) {
    next[zone] = next[zone].filter((id) => id !== toolId);
  }
  const targetItems = next[target];
  const targetIndex = beforeId ? targetItems.indexOf(beforeId) : -1;
  targetItems.splice(targetIndex < 0 ? targetItems.length : targetIndex, 0, toolId);
  return next;
}
