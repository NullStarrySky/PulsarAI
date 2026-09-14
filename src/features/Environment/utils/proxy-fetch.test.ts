import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginData } from "@/features/Plugin/dataflow/types";
import { createPluginEnvironment } from "@/features/Plugin/runtime/environment";
import { host } from "@/host";
import { proxyFetch } from "./proxy-fetch";

const originalProxyFetch = host.network.proxyFetch;

afterEach(() => {
	host.network.proxyFetch = originalProxyFetch;
});

describe("proxyFetch", () => {
	it("is the Environment fetch capability", () => {
		const data: PluginData = { id: "test", tree: {}, meta: {} };
		const environment = createPluginEnvironment({
			filetree: data,
			applyPulse: () => {},
			sourcePath: "/entry.js",
		});
		expect(environment.environment.fetch).toBe(proxyFetch);
	});

	it("serializes a curl-like request and restores its Response", async () => {
		const request = vi.fn(async () => ({
			url: "https://example.test/final",
			status: 201,
			statusText: "Created",
			redirected: true,
			headers: [{ name: "content-type", value: "text/plain" }],
			body: [111, 107],
		}));
		host.network.proxyFetch = request;

		const response = await proxyFetch("https://example.test/source", {
			method: "POST",
			headers: { "x-request-id": "test" },
			body: "payload",
			redirect: "manual",
			timeout: 1_000,
		});

		expect(request).toHaveBeenCalledWith({
			url: "https://example.test/source",
			method: "POST",
			headers: expect.arrayContaining([
				{ name: "content-type", value: "text/plain;charset=UTF-8" },
				{ name: "x-request-id", value: "test" },
			]),
			body: [...new TextEncoder().encode("payload")],
			redirect: "manual",
			timeout: 1_000,
		});
		expect(response.status).toBe(201);
		expect(response.statusText).toBe("Created");
		expect(response.headers.get("content-type")).toBe("text/plain");
		expect(await response.text()).toBe("ok");
	});

	it("rejects promptly when the caller aborts", async () => {
		host.network.proxyFetch = vi.fn(() => new Promise(() => {}));
		const controller = new AbortController();
		const pending = proxyFetch("https://example.test", {
			signal: controller.signal,
		});
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});
});
