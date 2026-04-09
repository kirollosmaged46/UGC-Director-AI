import http from "http";

const PORT = Number(process.env.PORT ?? 3000);
const BACKEND_PORT = 8080;

const server = http.createServer((req, res) => {
  const opts = {
    hostname: "127.0.0.1",
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${BACKEND_PORT}` },
  };

  const proxy = http.request(opts, (backRes) => {
    res.writeHead(backRes.statusCode ?? 200, backRes.headers);
    backRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    console.error("Proxy error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Backend unavailable");
    }
  });

  req.pipe(proxy, { end: true });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Proxy listening on port ${PORT} → backend :${BACKEND_PORT}`);
});
