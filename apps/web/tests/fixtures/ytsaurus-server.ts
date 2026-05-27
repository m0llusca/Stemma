import http from "node:http";

type Mode = "success" | "invalid_json" | "auth_failure";

export type YTsaurusRequest = {
  method: string;
  pathname: string;
  query: Record<string, string>;
  headers: Record<string, string>;
};

export async function createYTsaurusServer(options: { mode: Mode }) {
  const requests: YTsaurusRequest[] = [];
  const server = http.createServer((request, response) => {
    const parsedUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({
      method: request.method ?? "GET",
      pathname: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams.entries()),
      headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)]))
    });

    if (options.mode === "auth_failure") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "bad token" }));
      return;
    }

    if (options.mode === "invalid_json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{");
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify([
        {
          conversation_id: "yt-conv-1",
          message_id: "yt-msg-1",
          author_name: "Анна",
          participant_type: "customer",
          body: "Нужен возврат из YTsaurus.",
          sent_at: "2026-04-25T10:00:00Z",
          subject: "YTsaurus refund",
          customer_name: "Анна"
        }
      ])
    );
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
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
