import http from "node:http";

type Mode = "success" | "invalid_json" | "auth_failure" | "rows_object" | "values_object" | "oversized_stream";

export type YTsaurusRequest = {
  method: string;
  pathname: string;
  query: Record<string, string>;
  headers: Record<string, string>;
};

const sampleRow = {
  conversation_id: "yt-conv-1",
  message_id: "yt-msg-1",
  author_name: "Анна",
  participant_type: "customer",
  body: "Нужен возврат из YTsaurus.",
  sent_at: "2026-04-25T10:00:00Z",
  subject: "YTsaurus refund",
  customer_name: "Анна"
};

export async function createYTsaurusServer(options: { mode: Mode }) {
  const requests: YTsaurusRequest[] = [];
  let responseEnded = false;
  let closedBeforeEnd = false;
  let responseClosed = false;
  const responseCloseWaiters: Array<() => void> = [];
  const server = http.createServer((request, response) => {
    response.on("close", () => {
      if (!responseEnded) {
        closedBeforeEnd = true;
      }
      responseClosed = true;
      responseCloseWaiters.splice(0).forEach((resolve) => resolve());
    });

    const parsedUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: request.method ?? "GET",
      pathname: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)]))
    });

    if (options.mode === "auth_failure") {
      response.writeHead(401, { "content-type": "application/json" });
      responseEnded = true;
      response.end(JSON.stringify({ error: "bad token" }));
      return;
    }

    if (options.mode === "invalid_json") {
      response.writeHead(200, { "content-type": "application/json" });
      responseEnded = true;
      response.end("{");
      return;
    }

    if (options.mode === "rows_object") {
      response.writeHead(200, { "content-type": "application/json" });
      responseEnded = true;
      response.end(JSON.stringify({ rows: [sampleRow] }));
      return;
    }

    if (options.mode === "values_object") {
      response.writeHead(200, { "content-type": "application/json" });
      responseEnded = true;
      response.end(JSON.stringify({ values: [sampleRow] }));
      return;
    }

    if (options.mode === "oversized_stream") {
      const oversizedRow = { ...sampleRow, conversation_id: "yt-conv-large", body: "x".repeat(256) };
      response.writeHead(200, { "content-type": "application/json" });
      response.write(`${JSON.stringify(sampleRow)}\n`);
      setTimeout(() => {
        response.write(`${JSON.stringify(oversizedRow)}\n`);
      }, 5);
      const endTimer = setTimeout(() => {
        responseEnded = true;
        response.end(`${JSON.stringify(sampleRow)}\n`);
      }, 250);
      response.on("close", () => clearTimeout(endTimer));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    responseEnded = true;
    response.end(`${JSON.stringify(sampleRow)}\n`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected local YTsaurus fixture server address.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    get closedBeforeEnd() {
      return closedBeforeEnd;
    },
    waitForResponseClose: () =>
      responseClosed
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            responseCloseWaiters.push(resolve);
          }),
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
