import type { Component } from "vue";
import type { WorkspaceTab } from "./layout-store";

export interface WorkspaceResourceComponentProps {
  packageId?: string;
  resourceId: string;
  tab?: WorkspaceTab;
}

export interface WorkspaceResourceRegistration {
  type: string;
  component: Component<WorkspaceResourceComponentProps>;
}

const registrations = new Map<string, Component<WorkspaceResourceComponentProps>>();

export function registerWorkspaceResource(registration: WorkspaceResourceRegistration) {
  registrations.set(registration.type, registration.component);
}

export function getWorkspaceResourceComponent(type?: string) {
  return type ? registrations.get(type) : undefined;
}
