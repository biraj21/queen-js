import fs from "node:fs";
import http from "node:http";

import processJsonRequest from "./plugins/json";
import processMultipartRequest from "./plugins/multipart";

export interface QueenRequest extends http.IncomingMessage {
  body?: Record<string, any>;
  buffer?: Buffer;
}

export interface QueenResponse extends http.ServerResponse {
  sendFile: (path: string) => Promise<void>;
  json: (data: Record<string, any>) => void;
}

export type QueenNextFunction = () => void;

export type QueenRouteHandler = (
  req: QueenRequest,
  res: QueenResponse,
  next: QueenNextFunction
) => void | Promise<void>;

export class Queen {
  #routeHandlers: Record<string, QueenRouteHandler[]>;
  #plugins: QueenRouteHandler[];

  constructor() {
    this.#routeHandlers = {};
    this.#plugins = [];
  }

  static multipart(destination: string) {
    return processMultipartRequest(destination);
  }

  static json() {
    return processJsonRequest;
  }

  async get(route: string, handler: QueenRouteHandler, ...moreHandlers: QueenRouteHandler[]) {
    this.#registerRoute("GET", route, ...[handler, ...moreHandlers]);
  }

  async post(route: string, handler: QueenRouteHandler, ...moreHandlers: QueenRouteHandler[]) {
    this.#registerRoute("POST", route, ...[handler, ...moreHandlers]);
  }

  async put(route: string, handler: QueenRouteHandler, ...moreHandlers: QueenRouteHandler[]) {
    this.#registerRoute("PUT", route, ...[handler, ...moreHandlers]);
  }

  async patch(route: string, handler: QueenRouteHandler, ...moreHandlers: QueenRouteHandler[]) {
    this.#registerRoute("PATCH", route, ...[handler, ...moreHandlers]);
  }

  async delete(route: string, handler: QueenRouteHandler, ...moreHandlers: QueenRouteHandler[]) {
    this.#registerRoute("DELETE", route, ...[handler, ...moreHandlers]);
  }

  register(handler: QueenRouteHandler, ...moreHandlers: QueenRouteHandler[]) {
    if (Object.keys(this.#routeHandlers).length > 0) {
      throw new Error("cannot register a plugin after a route had been already registered");
    }

    this.#plugins.push(...[handler, ...moreHandlers]);
  }

  handler(): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
    return this.#handler.bind(this);
  }

  static #prepareQueenRequest(req: http.IncomingMessage): Promise<QueenRequest> {
    const queenReq: QueenRequest = Object.setPrototypeOf({}, req);

    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      req
        .on("error", reject)
        .on("data", (chunk) => {
          chunks.push(chunk);
        })
        .on("end", () => {
          queenReq.buffer = Buffer.concat(chunks);
          resolve(queenReq);
        });
    });
  }

  static #prepareQueenResponse(res: http.ServerResponse): QueenResponse {
    const queenRes: QueenResponse = Object.setPrototypeOf({}, res);

    queenRes.sendFile = (path: string) => {
      return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(path);

        readStream.on("close", resolve);
        readStream.on("error", reject);

        readStream.pipe(res);
      });
    };

    queenRes.json = (data: Record<string, any>) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    };

    return queenRes;
  }

  async #registerRoute(method: string, route: string, ...handlers: QueenRouteHandler[]) {
    if (handlers.length === 0) {
      throw new Error("at least one handler is required");
    }

    const key = `${method}:${route}`;
    if (key in this.#routeHandlers) {
      this.#routeHandlers[key].push(...handlers);
    } else {
      this.#routeHandlers[key] = handlers;
    }
  }

  async #handler(req: http.IncomingMessage, res: http.ServerResponse) {
    const { method, url } = req;
    const key = `${method}:${url}`;

    try {
      if (!(key in this.#routeHandlers)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ message: "not found" }));
        return;
      }

      const queenReq = await Queen.#prepareQueenRequest(req);
      const queenRes = Queen.#prepareQueenResponse(res);

      const routeHandlers = this.#routeHandlers[key];

      for (const plugin of this.#plugins) {
        let callNext = false;
        await plugin(queenReq, queenRes, () => (callNext = true));
        if (!callNext) {
          return;
        }
      }

      for (const handler of routeHandlers) {
        let callNext = false;
        await handler(queenReq, queenRes, () => (callNext = true));
        if (!callNext) {
          return;
        }
      }
    } catch (err) {
      console.error(key, err);

      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "internal server error" }));
    }
  }
}
