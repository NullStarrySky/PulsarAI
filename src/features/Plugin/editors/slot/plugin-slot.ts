import { push } from "notivue";
import { z } from "zod";

export const pluginSlotSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  icon: z.string().trim().min(1).optional(),
  description: z.string().default(""),
  contentSuffixes: z.array(z.string()).default([]),
  selectionMode: z.enum(["single", "multiple", "none"]).default("none"),
});

export const pluginSlotsSchema = z.object({
  slots: z.array(pluginSlotSchema).default([]),
});

export type PluginSlot = z.infer<typeof pluginSlotSchema>;
export type PluginSlotDefinitions = z.infer<typeof pluginSlotsSchema>;

export function createPluginSlotDefinitions(
  slots: PluginSlot[] = [],
): PluginSlotDefinitions {
  return { slots: structuredClone(slots) };
}

export function selectPluginSlotResources<T extends { worldPath: string }>(
  slot: PluginSlot,
  resources: T[],
) {
  return slot.selectionMode === "single" ? resources.slice(0, 1) : resources;
}

/** Parse and validate a slots.json resource at its editor boundary. */
export function parsePluginSlots(source: unknown): PluginSlot[] {
  let value = source;
  if (typeof source === "string") {
    try {
      value = JSON.parse(source);
    } catch {
      value = null;
    }
  }
  const parsed = pluginSlotsSchema.safeParse(value);
  if (!parsed.success) {
    push.warning("slots.json 类型无效，已忽略。");
    return [];
  }
  return parsed.data.slots;
}
