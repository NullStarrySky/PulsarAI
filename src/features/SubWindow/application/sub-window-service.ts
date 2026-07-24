import { emit, emitTo, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  createSubWindowLabel,
  encodeSubWindowParams,
  shouldCreateSubWindow,
  type SubWindowBridgeMessage,
  type SubWindowParams,
  type SubWindowTarget,
} from "../domain/sub-window-protocol";

export async function popOutTarget(target: SubWindowTarget, title?: string) {
  const params: SubWindowParams = {
    label: createSubWindowLabel(target),
    mode: "simplified",
    target,
    title,
    loadMode: "immediate",
  };
  return openSubWindow(params);
}

export async function openSubWindow(params: SubWindowParams) {
  if (!shouldCreateSubWindow(params)) {
    return null;
  }

  const url = `${window.location.pathname}?subwindow=${encodeSubWindowParams(params)}`;
  const webview = new WebviewWindow(params.label, {
    url,
    title: params.title ?? "PulsarAI",
    parent: "main",
    visible: !params.hidden,
    decorations: false,
    width: 980,
    height: 720,
  });

  webview.once("tauri://error", (event) => {
    console.error("Unable to create subwindow", event.payload);
  });
  return webview;
}

export async function popOutWorkspaceTab(tab: {
  resourceType: string;
  resourceId: string;
  packageId?: string;
  title: string;
  resourceParams?: Record<string, unknown>;
}) {
  const target: SubWindowTarget =
    tab.resourceType === "builtin"
      ? {
          type: "builtin",
          resourceId: tab.resourceId,
          title: tab.title,
          resourceParams: tab.resourceParams,
        }
      : {
          type: "resource",
          resourceType: tab.resourceType,
          resourceId: tab.resourceId,
          packageId: tab.packageId,
          title: tab.title,
          resourceParams: tab.resourceParams,
        };
  return popOutTarget(target, tab.title);
}

export async function returnToMain(target: SubWindowTarget) {
  await emit("subwindow:return", target);
}

export async function sendSubWindowParams(label: string, params: SubWindowParams) {
  await emitTo(label, "subwindow:params", params);
}

export async function sendBridgeMessage(message: Omit<SubWindowBridgeMessage, "id">) {
  await emit("subwindow:bridge", {
    ...message,
    id: crypto.randomUUID(),
  });
}

export async function listenBridgeMessages(handler: (message: SubWindowBridgeMessage) => void) {
  return listen<SubWindowBridgeMessage>("subwindow:bridge", (event) => handler(event.payload));
}
