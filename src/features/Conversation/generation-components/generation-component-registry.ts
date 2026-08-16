import type { Component } from "vue";

const components = new Map<string, Component>();

export function registerGenerationComponent(
  componentId: string,
  component: Component,
) {
  components.set(componentId, component);
  return () => {
    if (components.get(componentId) === component) {
      components.delete(componentId);
    }
  };
}

export function getGenerationComponent(componentId: string) {
  return components.get(componentId) ?? null;
}
