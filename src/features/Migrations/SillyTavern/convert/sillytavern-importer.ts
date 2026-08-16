import type { Pinia } from "pinia";
import { SillyTavernReader } from "./sillytavern-reader";
import { convertSillyTavernSnapshot } from "./sillytavern-converter";
import { placeSillyTavernArtifacts } from "./sillytavern-placer";
import type { SillyTavernPlacementPlan } from "./placement-plan";
import type { SillyTavernSourceSnapshot, SillyTavernReaderTransport } from "./source-types";
import {
  PulsarSillyTavernMigrationWriter,
  type SillyTavernImportCommitResult,
} from "./pulsar-migration-writer";

export interface SillyTavernMigrationPreview {
  snapshot: SillyTavernSourceSnapshot;
  plan: SillyTavernPlacementPlan;
}

export class SillyTavernImporter {
  private readonly reader: SillyTavernReader;
  private readonly writer: PulsarSillyTavernMigrationWriter;
  private previews = new Map<string, SillyTavernMigrationPreview>();

  constructor(pinia: Pinia, transport: SillyTavernReaderTransport) {
    this.reader = new SillyTavernReader(transport);
    this.writer = new PulsarSillyTavernMigrationWriter(pinia, transport);
  }

  async preview(path: string): Promise<SillyTavernMigrationPreview> {
    const snapshot = await this.reader.read(path);
    const conversion = convertSillyTavernSnapshot(snapshot);
    const plan = placeSillyTavernArtifacts(snapshot.rootPath, conversion);
    const preview = { snapshot, plan };
    this.previews.clear();
    this.previews.set(plan.id, preview);
    return preview;
  }

  async commit(planId: string): Promise<SillyTavernImportCommitResult> {
    const preview = this.previews.get(planId);
    if (!preview) throw new Error("迁移预览已失效，请重新扫描后再导入。");
    const result = await this.writer.commit(preview.plan);
    this.previews.delete(planId);
    return result;
  }
}
