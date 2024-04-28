import http from "node:http";

import { Queen } from "./lib";

const queen = new Queen();

// register plugins
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

queen.get("/users/:id", async (req, res) => {
  await res.send(`Hello user ${req.params.id}`);
});

// doesn't clash with the above dynamic route
queen.get("/users/profile", async (req, res) => {
  await res.send(`user's profile page`);
});

queen.post("/upload", async (req, res) => {
  await res.json({
    message: "ok",
    data: req.body || {},
  });
});

queen.post("/json", async (req, res) => {
  await res.json({
    message: "ok",
    data: req.body || {},
  });
});

const server = http.createServer(queen.handler());

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`server running on port ${PORT}...`));
