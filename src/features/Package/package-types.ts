export interface CharacterPackageConversationLink {
  id: string;
  lastContainerid: string;
  title: string;
}

export type WorldSlotSelectionMode = "single" | "multiple" | "none";

export interface WorldSlotConfig {
  id: string;
  title: string;
  icon?: string;
  description: string;
  contentSuffixes: string[];
  selectionMode: WorldSlotSelectionMode;
}

export interface WorldConfig {
  /** Shared cross-Plugin slot contracts, isomorphic with Plugin slots.json definitions. */
  slots: WorldSlotConfig[];
  /** Disabled World file paths or mounted Plugin folder paths. */
  disabled: string[];
}

export interface CharacterPackage {
  id: string;
  name: string;
  nickname?: string;
  icon: string;
  description?: string;
  categoryId?: string | null;
  order: number;
  pinned?: boolean;
  conversations: CharacterPackageConversationLink[];
  pluginId: string;
  /** World-owned shared slot contracts and disabled asset paths. */
  worldConfig: WorldConfig;
  syncEnabled?: boolean;
}

export interface PackageCategory {
  id: string;
  name: string;
  order: number;
}
