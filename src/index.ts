import http from "node:http";

import { Queen } from "./lib";

const queen = new Queen();

queen.register(Queen.json());

queen.register(Queen.multipart("custom-storage"));

// request logger
queen.register((req, res, next) => {
  console.log(`${req.method}, ${req.url}: ${new Date()}`);
  next();
});

queen.get("/", async (req, res) => {
  await res.sendFile("public/index.html");
});

queen.post("/upload", async (req, res) => {
  res.json({
    message: "ok",
    data: req.body || {},
  });
});

queen.post("/json", async (req, res) => {
  res.json({
    message: "ok",
    data: req.body || {},
  });
});

const server = http.createServer(queen.handler());

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`server running on port ${PORT}...`));
