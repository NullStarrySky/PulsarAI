import type { WorldSlotView } from "./world-store";

export interface SlotMenuNode {
	slot: WorldSlotView;
	children: SlotMenuNode[];
}
