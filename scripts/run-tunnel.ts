const defaultRendererUrl = "http://127.0.0.1:1420";

export interface TunnelHandle {
	url?: string;
	stop: () => Promise<void>;
}

export async function rendererIsReady(
	url = defaultRendererUrl,
): Promise<boolean> {
	try {
		return (await fetch(url)).ok;
	} catch {
		return false;
	}
}

export async function startCloudflareTunnel(options?: {
	targetUrl?: string;
	timeoutMs?: number;
}): Promise<TunnelHandle> {
	const targetUrl = options?.targetUrl ?? defaultRendererUrl;
	const timeoutMs = options?.timeoutMs ?? 20000;
	const cloudflaredBin = Bun.which("cloudflared") ?? "cloudflared";

	let stopped = false;
	let proc: ReturnType<typeof Bun.spawn> | undefined;

	const stop = async () => {
		if (stopped) return;
		stopped = true;
		if (proc) {
			if (process.platform === "win32" && proc.pid) {
				try {
					Bun.spawnSync(["taskkill", "/PID", String(proc.pid), "/T", "/F"], {
						stdout: "ignore",
						stderr: "ignore",
					});
				} catch {}
			} else {
				try {
					proc.kill();
				} catch {}
			}
			try {
				await proc.exited;
			} catch {}
		}
	};

	try {
		proc = Bun.spawn([cloudflaredBin, "tunnel", "--url", targetUrl], {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		console.warn(
			"[Cloudflare Tunnel] 启动失败，请检查是否已安装 cloudflared:",
			error,
		);
		return { stop };
	}

	let tunnelUrl: string | undefined;

	const extractUrlPromise = new Promise<string | undefined>((resolve) => {
		const decoder = new TextDecoder();
		let pending = "";
		let resolved = false;

		const handleText = (text: string) => {
			if (resolved) return;
			const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
			if (match) {
				resolved = true;
				tunnelUrl = match[0];
				resolve(tunnelUrl);
			}
		};

		const readStream = async (stream: ReadableStream<Uint8Array> | null) => {
			if (!stream) return;
			try {
				for await (const chunk of stream) {
					pending += decoder.decode(chunk, { stream: true });
					const lines = pending.split(/\r?\n/u);
					pending = lines.pop() ?? "";
					for (const line of lines) {
						handleText(line);
					}
				}
			} catch {
				// Ignore pipe close errors
			}
		};

		void readStream(proc.stderr);
		void readStream(proc.stdout);

		setTimeout(() => {
			if (!resolved) {
				resolved = true;
				resolve(undefined);
			}
		}, timeoutMs);
	});

	tunnelUrl = await extractUrlPromise;

	if (tunnelUrl) {
		const border = "─".repeat(tunnelUrl.length + 8);
		console.log(`\n┌${border}┐`);
		console.log(`│  🌐 Cloudflare Tunnel 外网访问已就绪:`);
		console.log(`│  ➜ ${tunnelUrl}`);
		console.log(`└${border}┘\n`);
	} else {
		console.warn(
			`[Cloudflare Tunnel] 未能在 ${Math.round(timeoutMs / 1000)} 秒内获取到公网地址，后台进程将继续尝试运行。`,
		);
	}

	return {
		url: tunnelUrl,
		stop,
	};
}

if (import.meta.main) {
	let vite: ReturnType<typeof Bun.spawn> | undefined;
	let tunnel: TunnelHandle | undefined;

	const cleanup = async () => {
		if (tunnel) {
			console.log("[tunnel] 正在停止 Cloudflare Tunnel...");
			await tunnel.stop();
		}
		if (vite) {
			console.log("[tunnel] 正在停止 Vite 服务...");
			vite.kill();
			await vite.exited;
		}
	};

	process.on("SIGINT", () => {
		void cleanup().finally(() => process.exit(0));
	});
	process.on("SIGTERM", () => {
		void cleanup().finally(() => process.exit(0));
	});

	if (!(await rendererIsReady())) {
		console.log("[tunnel] 启动 Vite 开发服务...");
		vite = Bun.spawn(
			["bun", "run", "renderer:dev", "--", "--host", "127.0.0.1"],
			{
				stdin: "ignore",
				stdout: "inherit",
				stderr: "inherit",
			},
		);

		for (
			let attempt = 0;
			attempt < 80 && !(await rendererIsReady());
			attempt += 1
		) {
			await Bun.sleep(250);
		}
	}

	if (!(await rendererIsReady())) {
		console.error("[tunnel] Vite 开发服务未就绪。");
		process.exit(1);
	}

	tunnel = await startCloudflareTunnel();
	console.log("[tunnel] 隧道已启动，按 Ctrl+C 退出。");
}
