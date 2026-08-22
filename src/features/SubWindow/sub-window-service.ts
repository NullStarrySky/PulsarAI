import { host } from "@/host";
import {
  createSubWindowLabel,
  encodeSubWindowParams,
  shouldCreateSubWindow,
  type SubWindowBridgeMessage,
  type SubWindowParams,
  type SubWindowTarget,
} from "./sub-window-protocol";

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
  const desktop = host.desktop;
  if (!desktop) {
    throw new Error("子窗口仅在桌面端可用。");
  }
  await desktop.subWindow.create({
    label: params.label,
    url,
    title: params.title ?? "PulsarAI",
    width: 980,
    height: 720,
    hidden: params.hidden,
  });
  return params.label;
}

export async function returnToMain(target: SubWindowTarget) {
  await host.desktop?.subWindow.send("main", "subwindow:return", target);
}

export async function sendSubWindowParams(label: string, params: SubWindowParams) {
  await host.desktop?.subWindow.send(label, "subwindow:params", params);
}

export async function sendBridgeMessage(message: Omit<SubWindowBridgeMessage, "id">) {
  await host.desktop?.subWindow.send("main", "subwindow:bridge", {
    ...message,
    id: crypto.randomUUID(),
  });
}

export function listenBridgeMessages(handler: (message: SubWindowBridgeMessage) => void) {
  if (!host.desktop) return () => {};
  return host.desktop.subWindow.listen("subwindow:bridge", (payload) => handler(payload as SubWindowBridgeMessage));
}
