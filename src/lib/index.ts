import fs from "node:fs";
import http from "node:http";

import processJsonRequest from "./plugins/json";
import processMultipartRequest from "./plugins/multipart";

export interface QueenRequest extends http.IncomingMessage {
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  body?: Record<string, any>;
  buffer?: Buffer;
}

export interface QueenResponse extends http.ServerResponse {
  json: (data: Record<string, any>) => Promise<void>;
  send: (data: any) => Promise<void>;
  sendFile: (path: string) => Promise<void>;
}

export type QueenNextFunction = () => void;

export type QueenRouteHandler = (
  req: QueenRequest,
  res: QueenResponse,
  next: QueenNextFunction
) => void | Promise<void>;

export interface QueenDynamicRoute {
  method: string;
  pattern: RegExp;
  specificity: number;
  mappedTo: Array<string | null>;
  handlers: QueenRouteHandler[];
}

export class Queen {
  #routeHandlers: Record<string, QueenRouteHandler[]>;
  #dynamicRouteHandlers: Record<string, QueenDynamicRoute>;
  #plugins: QueenRouteHandler[];

  constructor() {
    this.#routeHandlers = {};
    this.#dynamicRouteHandlers = {};
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

    const url = new URL(req.url || "/", "https://example.com");

    // prepare path
    queenReq.url = url.pathname.toLowerCase();
    if (!queenReq.url.endsWith("/")) {
      queenReq.url = queenReq.url + "/";
    }

    // prepare query params
    queenReq.query = {};
    for (const key of url.searchParams.keys()) {
      if (key in queenReq.query) {
        continue;
      }

      const values = url.searchParams.getAll(key);
      if (values.length === 1) {
        queenReq.query[key] = values[0];
      } else {
        queenReq.query[key] = values;
      }
    }

    queenReq.params = {};

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
      return new Promise((resolve, reject) => {
        res.setHeader("Content-Type", "application/json");

        res.on("error", reject);
        res.end(JSON.stringify(data), resolve as () => void);
      });
    };

    queenRes.send = (data: any) => {
      return new Promise((resolve, reject) => {
        res.on("error", reject);
        res.end(data, resolve as () => void);
      });
    };

    return queenRes;
  }

  async #registerRoute(method: string, route: string, ...handlers: QueenRouteHandler[]) {
    if (handlers.length === 0) {
      throw new Error("at least one handler is required");
    }

    const originalRoute = route;

    if (!route.startsWith("/")) {
      route = "/" + route;
    }

    if (!route.endsWith("/")) {
      route = route + "/";
    }

    route = route.toLowerCase();

    let dynamicPartsMapping: Array<string | null> = [];
    const parts = route.split("/");
    for (let part of parts.slice(1, parts.length - 1)) {
      if (part.startsWith(":")) {
        part = part.slice(1);
        dynamicPartsMapping.push(part);
      } else {
        dynamicPartsMapping.push(null);
      }

      if (!/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(part)) {
        throw new Error(`invalid route '${originalRoute}'`);
      }
    }

    const routeRegex = route.replace(/\/:\w+/g, "/(\\w+)");
    if (routeRegex !== route) {
      if (routeRegex in this.#dynamicRouteHandlers) {
        throw new Error(
          `a dynamic route handler is already defined for a route similar to ${originalRoute}`
        );
      }

      this.#dynamicRouteHandlers[routeRegex] = {
        method,
        pattern: new RegExp(`^${routeRegex}$`),
        specificity:
          dynamicPartsMapping.length -
          dynamicPartsMapping.filter((p) => typeof p === "string").length,
        mappedTo: dynamicPartsMapping,
        handlers,
      };

      return;
    }

    const key = `${method}:${route}`;
    if (key in this.#routeHandlers) {
      this.#routeHandlers[key].push(...handlers);
    } else {
      this.#routeHandlers[key] = handlers;
    }
  }

  async #handler(req: http.IncomingMessage, res: http.ServerResponse) {
    const { method } = req;

    let path = new URL(req.url || "/", "https://example.com").pathname.toLowerCase();
    if (!path.endsWith("/")) {
      path = path + "/";
    }

    const key = `${method}:${path}`;

    try {
      const queenReq = await Queen.#prepareQueenRequest(req);
      const queenRes = Queen.#prepareQueenResponse(res);

      // execute plugins
      for (const plugin of this.#plugins) {
        let callNext = false;
        await plugin(queenReq, queenRes, () => (callNext = true));
        if (!callNext) {
          return;
        }
      }

      // try to execute route handlers
      const routeHandlers = this.#routeHandlers[key] || [];
      for (const handler of routeHandlers) {
        let callNext = false;
        await handler(queenReq, queenRes, () => (callNext = true));
        if (!callNext) {
          return;
        }
      }

      if (routeHandlers.length > 0) {
        return;
      }

      // try to look for match in dynamic route handlers
      let dynamicRoute: QueenDynamicRoute | undefined;
      for (const dr in this.#dynamicRouteHandlers) {
        const currentDr = this.#dynamicRouteHandlers[dr];
        if (currentDr.method !== method) {
          continue;
        }

        const dynamicRouteSpecificity = dynamicRoute?.specificity || -1;
        if (currentDr.pattern.test(path) && currentDr.specificity > dynamicRouteSpecificity) {
          dynamicRoute = currentDr;
        }
      }

      if (dynamicRoute) {
        // prepare params object for this route
        const matches = Array.from(dynamicRoute.pattern.exec(path)?.values() || []).slice(1);
        const keys = dynamicRoute.mappedTo.filter((k) => k) as string[];
        for (let i = 0; i < keys.length; ++i) {
          queenReq.params[keys[i]] = matches[i];
        }

        for (const handler of dynamicRoute.handlers) {
          let callNext = false;
          await handler(queenReq, queenRes, () => (callNext = true));
          if (!callNext) {
            return;
          }
        }

        return;
      }

      if (!(key in this.#routeHandlers)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ message: "not found" }));
        return;
      }
    } catch (err) {
      console.error(key, err);

      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: "internal server error" }));
    } finally {
    }
  }
}
