/**
 * Procedural cover image generator.
 * Creates an actual PNG data URL (`data:image/png;base64,...`)
 * by rendering procedural gradient and geometric art onto an offscreen canvas.
 */

function hashString(str: string): number {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function createRng(seedStr: string) {
	let s = hashString(seedStr) || 123456789;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

export function generateProceduralCoverDataUrl(
	seed: string,
	title = "",
	width = 800,
	height = 500,
): string {
	if (typeof document === "undefined") {
		const hue1 = hashString(seed) % 360;
		const hue2 = (hue1 + 55) % 360;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="hsl(${hue1},70%,50%)"/><stop offset="100%" stop-color="hsl(${hue2},75%,35%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";

	const rng = createRng(seed + title);

	const baseHue = Math.floor(rng() * 360);
	const hue2 = (baseHue + 40 + Math.floor(rng() * 40)) % 360;
	const hue3 = (baseHue + 140 + Math.floor(rng() * 60)) % 360;

	// Background linear gradient
	const angle = rng() * Math.PI * 2;
	const x1 = width / 2 + Math.cos(angle) * (width / 2);
	const y1 = height / 2 + Math.sin(angle) * (height / 2);
	const x2 = width / 2 - Math.cos(angle) * (width / 2);
	const y2 = height / 2 - Math.sin(angle) * (height / 2);

	const bgGrad = ctx.createLinearGradient(x1, y1, x2, y2);
	bgGrad.addColorStop(0, `hsl(${baseHue}, 75%, 35%)`);
	bgGrad.addColorStop(0.5, `hsl(${hue2}, 65%, 22%)`);
	bgGrad.addColorStop(1, `hsl(${hue3}, 80%, 15%)`);
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, width, height);

	// Radial glowing orbs
	const orbCount = 3 + Math.floor(rng() * 3);
	for (let i = 0; i < orbCount; i++) {
		const ox = rng() * width;
		const oy = rng() * height;
		const radius = width * (0.25 + rng() * 0.4);
		const orbHue = (baseHue + Math.floor(rng() * 120)) % 360;

		const radGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
		radGrad.addColorStop(0, `hsla(${orbHue}, 85%, 65%, 0.45)`);
		radGrad.addColorStop(0.6, `hsla(${orbHue}, 80%, 50%, 0.15)`);
		radGrad.addColorStop(1, `hsla(${orbHue}, 80%, 40%, 0)`);

		ctx.fillStyle = radGrad;
		ctx.beginPath();
		ctx.arc(ox, oy, radius, 0, Math.PI * 2);
		ctx.fill();
	}

	// Procedural subtle geometric accents / arcs
	ctx.save();
	ctx.lineWidth = 1.5;
	const lineCount = 4 + Math.floor(rng() * 4);
	for (let i = 0; i < lineCount; i++) {
		const cx = rng() * width;
		const cy = rng() * height;
		const r = 80 + rng() * 180;
		ctx.strokeStyle = `hsla(${hue2}, 90%, 75%, ${0.08 + rng() * 0.12})`;
		ctx.beginPath();
		ctx.arc(cx, cy, r, rng() * Math.PI, rng() * Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();

	// Soft noise / vignette overlay
	const vignette = ctx.createRadialGradient(
		width / 2,
		height / 2,
		width * 0.25,
		width / 2,
		height / 2,
		width * 0.7,
	);
	vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
	vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, width, height);

	return canvas.toDataURL("image/png");
}

export function generateProceduralAvatarDataUrl(
	seed: string,
	title = "",
	size = 256,
): string {
	const initial = (title.trim() || "P").slice(0, 1).toUpperCase();
	if (typeof document === "undefined") {
		const hue1 = hashString(seed) % 360;
		const hue2 = (hue1 + 50) % 360;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="hsl(${hue1},75%,45%)"/><stop offset="100%" stop-color="hsl(${hue2},80%,25%)"/></linearGradient></defs><rect width="${size}" height="${size}" rx="${size / 2}" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="${Math.round(size * 0.44)}" font-weight="700">${initial}</text></svg>`;
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
	}

	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";

	const rng = createRng(seed + title + "avatar");
	const baseHue = Math.floor(rng() * 360);
	const hue2 = (baseHue + 45 + Math.floor(rng() * 40)) % 360;
	const hue3 = (baseHue + 160 + Math.floor(rng() * 50)) % 360;

	// Background circle gradient
	const bgGrad = ctx.createLinearGradient(0, 0, size, size);
	bgGrad.addColorStop(0, `hsl(${baseHue}, 80%, 45%)`);
	bgGrad.addColorStop(0.5, `hsl(${hue2}, 70%, 28%)`);
	bgGrad.addColorStop(1, `hsl(${hue3}, 85%, 16%)`);
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, size, size);

	// Ambient orbs
	const orbCount = 3;
	for (let i = 0; i < orbCount; i++) {
		const ox = rng() * size;
		const oy = rng() * size;
		const rad = size * (0.3 + rng() * 0.35);
		const orbHue = (baseHue + Math.floor(rng() * 100)) % 360;
		const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
		grad.addColorStop(0, `hsla(${orbHue}, 90%, 65%, 0.45)`);
		grad.addColorStop(0.7, `hsla(${orbHue}, 80%, 45%, 0.1)`);
		grad.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(ox, oy, rad, 0, Math.PI * 2);
		ctx.fill();
	}

	// Concentric abstract ring accents
	ctx.save();
	ctx.lineWidth = 2;
	for (let i = 0; i < 3; i++) {
		const r = size * (0.2 + i * 0.18);
		ctx.strokeStyle = `hsla(${hue2}, 95%, 75%, ${0.12 + i * 0.05})`;
		ctx.beginPath();
		ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();

	// Stylized Monogram / Initial
	const fontSize = Math.round(size * 0.44);
	ctx.font = `bold ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Soft drop shadow
	ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
	ctx.shadowBlur = Math.round(size * 0.08);
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = Math.round(size * 0.03);

	ctx.fillStyle = "#ffffff";
	ctx.fillText(initial, size / 2, size / 2 + size * 0.03);

	return canvas.toDataURL("image/png");
}
