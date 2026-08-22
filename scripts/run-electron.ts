const rendererUrl = "http://127.0.0.1:1420";

async function rendererIsReady() {
  try {
    return (await fetch(rendererUrl)).ok;
  } catch {
    return false;
  }
}

let vite: ReturnType<typeof Bun.spawn> | undefined;

try {
  if (!await rendererIsReady()) {
    vite = Bun.spawn(["bun", "run", "renderer:dev", "--", "--host", "127.0.0.1"], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    for (let attempt = 0; attempt < 80 && !await rendererIsReady(); attempt += 1) {
      await Bun.sleep(250);
    }
  }
  if (!await rendererIsReady()) throw new Error(`Electron renderer did not become available at ${rendererUrl}.`);
  const electron = Bun.spawn(["bunx", "electron", "host/desktop-electron/main.mjs"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl, PULSAR_HOST: "desktop-electron" },
  });
  process.exit(await electron.exited);
} finally {
  if (vite) {
    vite.kill();
    await vite.exited;
  }
}
