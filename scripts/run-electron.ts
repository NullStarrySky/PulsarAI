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

async function rendererIsReady() {
	try {
		return (await fetch(rendererUrl)).ok;
	} catch {
		return false;
	}
}

let vite: ReturnType<typeof Bun.spawn> | undefined;

try {
	if (!(await rendererIsReady())) {
		vite = Bun.spawn(
			["bun", "run", "renderer:dev", "--", "--host", "127.0.0.1"],
			{
				stdin: "inherit",
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
	if (!(await rendererIsReady()))
		throw new Error(
			`Electron renderer did not become available at ${rendererUrl}.`,
		);
	const electron = Bun.spawn(
		["bunx", "electron", "host/desktop-electron/main.mjs"],
		{
			stdin: "inherit",
			stdout: "inherit",
			stderr: "pipe",
			env: {
				...process.env,
				ELECTRON_RENDERER_URL: rendererUrl,
				PULSAR_HOST: "desktop-electron",
			},
		},
	);
	const stderr = forwardElectronStderr(electron.stderr);
	const exitCode = await electron.exited;
	await stderr;
	process.exit(exitCode);
} finally {
	if (vite) {
		vite.kill();
		await vite.exited;
	}
}
