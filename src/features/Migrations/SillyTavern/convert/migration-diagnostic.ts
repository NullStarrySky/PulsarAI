export type MigrationDiagnosticSeverity = "info" | "warning" | "error";

export interface MigrationSourceReference {
  path: string;
  relativePath: string;
  resourceKind?: string;
  fieldPath?: string;
}

export interface MigrationDiagnostic {
  code: string;
  severity: MigrationDiagnosticSeverity;
  message: string;
  source?: MigrationSourceReference;
  details?: Record<string, unknown>;
}

export function migrationDiagnostic(
  code: string,
  severity: MigrationDiagnosticSeverity,
  message: string,
  source?: MigrationSourceReference,
  details?: Record<string, unknown>,
): MigrationDiagnostic {
  return { code, severity, message, source, details };
}
