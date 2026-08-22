import { host } from "@/host";
import { getRuntimePlatform } from "@/features/Misc/platform";

export type EnvironmentToolId = "nodejs" | "git";

export type EnvironmentToolStatus = {
  id: EnvironmentToolId;
  name: string;
  version: string;
  installed: boolean;
  installPath: string;
  error: string;
};

const tools: Record<
  EnvironmentToolId,
  { name: string; versionCommand: string; windowsPathCommand: string; unixPathCommand: string }
> = {
  nodejs: {
    name: "Node.js",
    versionCommand: "node-version",
    windowsPathCommand: "node-path-windows",
    unixPathCommand: "node-path-unix",
  },
  git: {
    name: "Git",
    versionCommand: "git-version",
    windowsPathCommand: "git-path-windows",
    unixPathCommand: "git-path-unix",
  },
};

export async function detectEnvironmentTools(): Promise<EnvironmentToolStatus[]> {
  return Promise.all((Object.keys(tools) as EnvironmentToolId[]).map((id) => detectTool(id)));
}

async function detectTool(id: EnvironmentToolId): Promise<EnvironmentToolStatus> {
  const definition = tools[id];
  const pathCommand = getRuntimePlatform() === "windows" ? definition.windowsPathCommand : definition.unixPathCommand;
  const [versionResult, pathResult] = await Promise.allSettled([
    executeCommand(definition.versionCommand),
    executeCommand(pathCommand),
  ]);
  const version = versionResult.status === "fulfilled" ? firstLine(versionResult.value) : "";
  const installPath = pathResult.status === "fulfilled" ? firstLine(pathResult.value) : "";
  const installed = Boolean(version || installPath);
  const error = installed ? "" : collectError(versionResult, pathResult) || "未检测到可用命令。";

  return {
    id,
    name: definition.name,
    version,
    installed,
    installPath,
    error,
  };
}

async function executeCommand(commandName: string) {
  if (!host.desktop) throw new Error("环境检测仅在桌面端可用。");
  const output = await host.desktop.executeEnvironmentCommand(commandName);
  if (output.code !== 0) {
    throw new Error(output.stderr || `Command exited with ${output.code}`);
  }
  return output.stdout.trim();
}

function firstLine(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function collectError(...results: PromiseSettledResult<string>[]) {
  return results
    .map((result) =>
      result.status === "rejected" && result.reason instanceof Error ? result.reason.message : "",
    )
    .find(Boolean);
}
