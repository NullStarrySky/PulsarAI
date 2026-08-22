const DEV_PORT = 1420

function findWindowsListeningPids(port: number): number[] {
  const result = Bun.spawnSync(["netstat", "-ano", "-p", "tcp"], {
    stdout: "pipe",
    stderr: "pipe",
  })

  if (result.exitCode !== 0) {
    const message = result.stderr.toString().trim()
    throw new Error(`无法检查端口 ${port}${message ? `：${message}` : ""}`)
  }

  const pids = new Set<number>()

  for (const line of result.stdout.toString().split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/)
    if (
      columns.length < 5 ||
      columns[0]?.toUpperCase() !== "TCP" ||
      columns[2] === undefined ||
      columns[3]?.toUpperCase() !== "LISTENING" ||
      !columns[1]?.endsWith(`:${port}`)
    ) {
      continue
    }

    const pid = Number(columns[4])
    if (Number.isInteger(pid) && pid > 0) {
      pids.add(pid)
    }
  }

  return [...pids]
}

function releaseWindowsDevPort(port: number): void {
  const pids = findWindowsListeningPids(port)

  for (const pid of pids) {
    console.log(`[tauri] 关闭占用端口 ${port} 的进程树（PID ${pid}）`)
    const result = Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], {
      stdout: "inherit",
      stderr: "inherit",
    })

    if (result.exitCode !== 0 && findWindowsListeningPids(port).includes(pid)) {
      throw new Error(`无法关闭占用端口 ${port} 的进程（PID ${pid}）`)
    }
  }

  const remainingPids = findWindowsListeningPids(port)
  if (remainingPids.length > 0) {
    throw new Error(`端口 ${port} 仍被 PID ${remainingPids.join(", ")} 占用`)
  }
}

const args = Bun.argv.slice(2)

if (args[0] === "dev" && process.platform === "win32") {
  releaseWindowsDevPort(DEV_PORT)
}

const child = Bun.spawn(["bunx", "tauri", ...args, "--config", "host/mobile-tauri/tauri.conf.json"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

const exitCode = await child.exited
process.exit(exitCode)
