import type { MigrationDiagnostic } from "./migration-diagnostic";
import type {
  BackgroundMigrationArtifact,
  CharacterPackageMigrationArtifact,
  ConversationMigrationArtifact,
  PresetMigrationArtifact,
  ProviderMigrationArtifact,
  QuickReplyMigrationArtifact,
  UserPersonaMigrationArtifact,
  WorldbookMigrationArtifact,
} from "./migration-artifact";

export interface CharacterPackagePlacement {
  id: string;
  pluginId: string;
  artifact: CharacterPackageMigrationArtifact;
  conversations: ConversationMigrationArtifact[];
  claimedWorldbooks: WorldbookMigrationArtifact[];
  personas: UserPersonaMigrationArtifact[];
}

export interface GlobalPluginPlacement {
  id: string;
  name: string;
  existing: boolean;
  worldbook?: WorldbookMigrationArtifact;
  presets?: PresetMigrationArtifact[];
  backgrounds?: BackgroundMigrationArtifact[];
  quickReplies?: QuickReplyMigrationArtifact[];
  enabledPackageIds?: string[];
}

export interface SillyTavernPlacementPlan {
  id: string;
  sourceRoot: string;
  createdAt: string;
  packages: CharacterPackagePlacement[];
  globalPlugins: GlobalPluginPlacement[];
  providers: ProviderMigrationArtifact[];
  diagnostics: MigrationDiagnostic[];
  conflicts: MigrationDiagnostic[];
  counts: {
    packages: number;
    conversations: number;
    localWorldbooks: number;
    globalWorldbooks: number;
    presets: number;
    backgrounds: number;
    quickReplies: number;
    providers: number;
  };
}
