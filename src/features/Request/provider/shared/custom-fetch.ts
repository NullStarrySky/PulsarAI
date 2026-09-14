import { host } from "@/host";

interface ProxyHeader {
	name: string;
	value: string;
}

interface ProxyFetchResponse {
	status: number;
	headers: ProxyHeader[];
	body: number[];
}

async function readRequestBody(request: Request) {
	if (
		request.method === "GET" ||
		request.method === "HEAD" ||
		request.body === null
	) {
		return undefined;
	}
	return [...new Uint8Array(await request.clone().arrayBuffer())];
}

export const modelProxyFetch: typeof fetch = async (input, init) => {
	const request = input instanceof Request ? input : new Request(input, init);
	const headers: ProxyHeader[] = [];
	request.headers.forEach((value, name) => {
		headers.push({ name, value });
	});

	const body = await readRequestBody(request);
	const response = await host.network.modelProxyFetch<ProxyFetchResponse>({
		url: request.url,
		method: request.method,
		headers,
		body,
	});

	return new Response(new Uint8Array(response.body), {
		status: response.status,
		headers: response.headers.map((header): [string, string] => [
			header.name,
			header.value,
		]),
	});
};
