import { invoke } from "@tauri-apps/api/core";
import type {
  MigrationScanResult,
  SillyTavernReaderTransport,
} from "./source-types";

export const tauriSillyTavernReaderTransport: SillyTavernReaderTransport = {
  scan(path) {
    return invoke<MigrationScanResult>("migration_scan_path", { path });
  },
  readText(path) {
    return invoke<string>("migration_read_text", { path });
  },
  readBinary(path) {
    return invoke<{ mediaType: string; base64: string }>("migration_read_binary", { path });
  },
  readPngCharacter(path) {
    return invoke<string>("migration_read_png_character", { path });
  },
};
