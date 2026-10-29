import {
	rendererIsReady,
	startCloudflareTunnel,
	type TunnelHandle,
} from "./run-tunnel.ts";

const rendererUrl = "http://127.0.0.1:1420";
const ignoredElectronStderr =
	"libpng warning: iCCP: known incorrect sRGB profile";

async function forwardElectronStderr(stream: ReadableStream<Uint8Array>) {
	const decoder = new TextDecoder();
	let pending = "";
	for await (const chunk of stream) {
		pending += decoder.decode(chunk, { stream: true });
		const lines = pending.split(/\r?\n/u);
		pending = lines.pop() ?? "";
		for (const line of lines) {
			if (line !== ignoredElectronStderr) process.stderr.write(`${line}\n`);
		}
	}
	pending += decoder.decode();
	if (pending && pending !== ignoredElectronStderr)
		process.stderr.write(pending);
}

let vite: ReturnType<typeof Bun.spawn> | undefined;
let tunnel: TunnelHandle | undefined;
let exitCode = 1;

const enableTunnel =
	!process.argv.includes("--no-tunnel") &&
	process.env.TUNNEL !== "0" &&
	process.env.NO_TUNNEL !== "1";

const cleanup = async () => {
	if (tunnel) {
		await tunnel.stop();
		tunnel = undefined;
	}
	if (vite) {
		vite.kill();
		await vite.exited;
		vite = undefined;
	}
};

process.on("SIGINT", () => {
	void cleanup().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
	void cleanup().finally(() => process.exit(0));
});

try {
	if (!(await rendererIsReady(rendererUrl))) {
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
			attempt < 80 && !(await rendererIsReady(rendererUrl));
			attempt += 1
		) {
			await Bun.sleep(250);
		}
	}
	if (!(await rendererIsReady(rendererUrl)))
		throw new Error(
			`Electron renderer did not become available at ${rendererUrl}.`,
		);

	if (enableTunnel) {
		startCloudflareTunnel({ targetUrl: rendererUrl })
			.then((handle) => {
				tunnel = handle;
			})
			.catch((error) => {
				console.warn("[Cloudflare Tunnel] 启动失败:", error);
			});
	}

	const electron = Bun.spawn(
		["bunx", "electron", "host/desktop-electron/main.mjs"],
		{
			stdin: "ignore",
			stdout: "inherit",
			stderr: "pipe",
			env: {
				...process.env,
				ELECTRON_RENDERER_URL: rendererUrl,
				...(tunnel?.url ? { ELECTRON_TUNNEL_URL: tunnel.url } : {}),
				PULSAR_HOST: "desktop-electron",
			},
		},
	);
	const stderr = forwardElectronStderr(electron.stderr);
	exitCode = await electron.exited;
	await stderr;
} finally {
	await cleanup();
}

process.exit(exitCode);
