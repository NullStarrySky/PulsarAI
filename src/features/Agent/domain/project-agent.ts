export const builtinProjectAgentPackageId = "builtin-pulsarai-project-agent";
export const builtinProjectAgentPluginId = "builtin-pulsarai-project-plugin";

export function isProjectAgentPackage(packageId?: string | null) {
  return packageId === builtinProjectAgentPackageId;
}
