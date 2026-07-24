import { invoke } from "@tauri-apps/api/core";

interface ProxyHeader {
  name: string;
  value: string;
}

interface ProxyFetchResponse {
  status: number;
  headers: ProxyHeader[];
  body: number[];
}

async function readRequestBody(init?: RequestInit) {
  if (!init?.body) {
    return undefined;
  }

  if (typeof init.body === "string") {
    return [...new TextEncoder().encode(init.body)];
  }

  if (init.body instanceof Uint8Array) {
    return [...init.body];
  }

  if (init.body instanceof ArrayBuffer) {
    return [...new Uint8Array(init.body)];
  }

  if (init.body instanceof FormData) {
    throw new Error("modelProxyFetch does not support FormData bodies yet.");
  }

  return [...new TextEncoder().encode(String(init.body))];
}

export const modelProxyFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const headers: ProxyHeader[] = [];
  request.headers.forEach((value, name) => headers.push({ name, value }));

  const body = init?.body ? await readRequestBody(init) : await readRequestBody({ body: await request.clone().text() });
  const response = await invoke<ProxyFetchResponse>("model_proxy_fetch", {
    request: {
      url: request.url,
      method: request.method,
      headers,
      body,
    },
  });

  return new Response(new Uint8Array(response.body), {
    status: response.status,
    headers: response.headers.map((header) => [header.name, header.value]),
  });
};
