import { host } from "@/host";
import type {
  MigrationScanResult,
  SillyTavernReaderTransport,
} from "./source-types";

export const hostSillyTavernReaderTransport: SillyTavernReaderTransport = {
  scan(path) {
    return host.migration.invoke<MigrationScanResult>("scan", { path });
  },
  readText(path) {
    return host.migration.invoke<string>("readText", { path });
  },
  readBinary(path) {
    return host.migration.invoke<{ mediaType: string; base64: string }>("readBinary", { path });
  },
  readPngCharacter(path) {
    return host.migration.invoke<string>("readPngCharacter", { path });
  },
};
