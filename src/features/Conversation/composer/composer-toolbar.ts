const composerToolDefinitions = [
  { id: "model", label: "模型" },
  { id: "optimize", label: "优化提示词" },
  { id: "attachment", label: "附加文件" },
  { id: "whiteboard", label: "白板" },
  { id: "map", label: "会话地图" },
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
  left: ["optimize", "attachment"],
  right: ["model", "whiteboard", "map", "fullscreen"],
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


