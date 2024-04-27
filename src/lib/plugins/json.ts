import { QueenRouteHandler } from "..";

const processJsonRequest: QueenRouteHandler = (req, res, next) => {
  if (req.headers["content-type"] !== "application/json" || !req.buffer) {
    next();
    return;
  }

  try {
    req.body = JSON.parse(req.buffer.toString());
  } catch (err) {
  } finally {
    next();
  }
};

export default processJsonRequest;
