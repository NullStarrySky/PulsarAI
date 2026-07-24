export type SubWindowMode = "normal" | "simplified";

export type SubWindowTarget =
  | {
      type: "resource";
      resourceType: string;
      resourceId: string;
      packageId?: string;
      title?: string;
      resourceParams?: Record<string, unknown>;
    }
  | { type: "builtin"; resourceId: string; title?: string; resourceParams?: Record<string, unknown> }
  | { type: "component"; componentId: string; title?: string; props?: Record<string, unknown> };

export type SubWindowParams = {
  label: string;
  mode: SubWindowMode;
  target: SubWindowTarget;
  hidden?: boolean;
  loadMode?: "immediate" | "on-visible";
  title?: string;
};

export type SubWindowBridgeMessage = {
  id: string;
  channel: string;
  payload: unknown;
  sourceLabel: string;
  targetLabel?: string;
};

export function createSubWindowLabel(target: SubWindowTarget) {
  const id =
    target.type === "resource"
      ? `${target.resourceType}-${target.resourceId}`
      : target.type === "builtin"
        ? `builtin-${target.resourceId}`
        : `component-${target.componentId}`;
  return `pulsarai-${id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function encodeSubWindowParams(params: SubWindowParams) {
  return encodeURIComponent(JSON.stringify(params));
}

export function decodeSubWindowParams(value: string | null): SubWindowParams | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(value)) as SubWindowParams;
  } catch {
    return null;
  }
}

export function readSubWindowParamsFromLocation(location: Location = window.location) {
  return decodeSubWindowParams(new URL(location.href).searchParams.get("subwindow"));
}

export function shouldCreateSubWindow(params: SubWindowParams) {
  return !(params.hidden && params.loadMode === "on-visible");
}
