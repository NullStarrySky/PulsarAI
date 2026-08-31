import { z } from "zod";
import defaultWorldConfig from "@/features/Plugin/builtIn/world-config.json";
import type { WorldConfig } from "@/features/Package/package-types";
import { pluginSlotSchema } from "@/features/Plugin/editors/slot/plugin-slot";
import { normalizeWorldPath } from "./world-path";

export const worldConfigSchema = z.object({
  slots: z.array(pluginSlotSchema).default([]),
  disabled: z.array(z.string()).default([]),
});

export function createWorldConfig(value: unknown = defaultWorldConfig): WorldConfig {
  const parsed = worldConfigSchema.parse(value);
  return structuredClone({
    ...parsed,
    disabled: [...new Set(parsed.disabled.map((path) => `/${normalizeWorldPath(path)}`).filter((path) => path !== "/"))],
  });
}

export function parseWorldConfig(value: unknown): WorldConfig {
  if (typeof value === "string") return createWorldConfig(JSON.parse(value));
  return createWorldConfig(value);
}

export function worldSlot(config: WorldConfig, id: string) {
  return config.slots.find((slot) => slot.id === id) ?? null;
}

export function isWorldPathDisabled(config: WorldConfig, path: string) {
  const normalized = `/${normalizeWorldPath(path)}`;
  return config.disabled.some((disabled) =>
    normalized === disabled || normalized.startsWith(`${disabled}/`));
}

export function selectWorldSlotPaths(
  current: WorldConfig,
  slotId: string,
  availablePaths: string[],
  knownPaths: string[],
  enabledPaths: string[],
) {
  const definition = worldSlot(current, slotId);
  if (!definition) throw new Error(`World config 未定义全局插槽：${slotId}`);
  const normalize = (path: string) => `/${normalizeWorldPath(path)}`;
  const available = new Set(availablePaths.map(normalize));
  const requested = [...new Set(enabledPaths.map(normalize))].filter((path) => available.has(path));
  const selected = new Set(definition.selectionMode === "single" ? requested.slice(0, 1) : requested);
  const known = new Set(knownPaths.map(normalize));
  const disabled = new Set(current.disabled);

  for (const entry of [...disabled]) {
    if (![...selected].some((path) => path === entry || path.startsWith(`${entry}/`))) continue;
    disabled.delete(entry);
    for (const path of known) {
      if ((path === entry || path.startsWith(`${entry}/`)) && !selected.has(path)) disabled.add(path);
    }
  }
  for (const path of available) {
    disabled.delete(path);
    if (!selected.has(path)) disabled.add(path);
  }
  const next = createWorldConfig(current);
  next.disabled = [...disabled].sort((left, right) => left.localeCompare(right));
  return next;
}
