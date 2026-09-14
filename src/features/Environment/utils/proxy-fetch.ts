import {
	type HostProxyFetchRequest,
	type HostProxyFetchResponse,
	host,
} from "@/host";

export interface ProxyFetchInit extends RequestInit {
	/** Maximum host-side request duration in milliseconds, from 1 to 120000. */
	timeout?: number;
}

function abortError(signal: AbortSignal) {
	return (
		signal.reason ??
		new DOMException("The operation was aborted.", "AbortError")
	);
}

function waitForAbort<T>(promise: Promise<T>, signal: AbortSignal) {
	if (signal.aborted) return Promise.reject(abortError(signal));
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(abortError(signal));
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

async function toHostRequest(
	request: Request,
	timeout?: number,
): Promise<HostProxyFetchRequest> {
	const headers: HostProxyFetchRequest["headers"] = [];
	request.headers.forEach((value, name) => {
		headers.push({ name, value });
	});
	const body =
		request.method === "GET" ||
		request.method === "HEAD" ||
		request.body === null
			? undefined
			: [...new Uint8Array(await request.clone().arrayBuffer())];
	return {
		url: request.url,
		method: request.method,
		headers,
		body,
		redirect: request.redirect,
		timeout,
	};
}

/** A standard Response facade over the Host's HTTP(S) proxy transport. */
export async function proxyFetch(
	input: RequestInfo | URL,
	init?: ProxyFetchInit,
): Promise<Response> {
	const { timeout, ...requestInit } = init ?? {};
	const request = new Request(input, requestInit);
	const pending = host.network.proxyFetch(
		await toHostRequest(request, timeout),
	);
	const result = request.signal
		? await waitForAbort(pending, request.signal)
		: await pending;
	return responseFromHost(result);
}

function responseFromHost(response: HostProxyFetchResponse) {
	const body = [204, 205, 304].includes(response.status)
		? null
		: new Uint8Array(response.body);
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers.map((header): [string, string] => [
			header.name,
			header.value,
		]),
	});
}
