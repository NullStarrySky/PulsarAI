import type { Component } from "vue";
import type { WorkspaceTab } from "./layout-store";

export interface WorkspaceResourceComponentProps {
  packageId?: string;
  resourceId: string;
  tab?: WorkspaceTab;
}

export interface WorkspaceResourceRegistration {
  type: string;
  id?: string;
  component: Component;
}

const registrations = new Map<string, Component>();
let emptyWorkspaceComponent: Component | undefined;

function registrationKey(type: string, id?: string) {
  return id ? `${type}:${id}` : type;
}

export function registerWorkspaceResource(registration: WorkspaceResourceRegistration) {
  registrations.set(registrationKey(registration.type, registration.id), registration.component);
}

export function getWorkspaceResourceComponent(type?: string, id?: string) {
  return type ? registrations.get(registrationKey(type, id)) ?? registrations.get(type) : undefined;
}

export function registerWorkspaceEmptyComponent(component: Component) {
  emptyWorkspaceComponent = component;
}

export function getWorkspaceEmptyComponent() {
  return emptyWorkspaceComponent;
}
