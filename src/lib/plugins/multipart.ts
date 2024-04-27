import fs from "node:fs";
import path from "node:path";

import { QueenRouteHandler } from "..";

const processMultipartRequest = (destination: string): QueenRouteHandler => {
  fs.mkdirSync(destination, { recursive: true });

  const plugin: QueenRouteHandler = async (req, res, next) => {
    if (!req.headers["content-type"]?.startsWith("multipart/form-data;")) {
      next();
      return;
    }

    // get the boundary
    const boundaryPart = req.headers["content-type"].split(";")[1]?.trim();
    let boundary: string | undefined;
    if (typeof boundaryPart === "string" && boundaryPart.startsWith("boundary=")) {
      boundary = boundaryPart.slice("boundary=".length).trim();
    }

    if (!boundary || !req.buffer) {
      next();
      return;
    }

    req.body = await parseMultipartData(req.buffer, boundary, destination);
    next();
  };

  return plugin;
};

export default processMultipartRequest;

const PART_HEADER_REGEX =
  /Content-Disposition: form-data; name="([a-zA-Z0-9]+)"(?:(?:; filename="([a-zA-Z0-9. _\-]+)")?\r?\n(?:Content-Type: ([a-z\/]+))?)?/;

const parsePartHeader = (partHeader: string) => {
  const result: {
    name?: string;
    file?: {
      filename?: string;
      "content-type"?: string;
    };
  } = {};

  const groups = partHeader.match(PART_HEADER_REGEX)?.slice(1) || [];

  if (groups[0]) {
    result.name = groups[0];
  }

  if (groups[1]) {
    result.file = {
      filename: groups[1],
    };
  }

  if (groups[2] && result.file) {
    result.file["content-type"] = groups[2];
  }

  return result;
};

const parseMultipartData = async (buffer: Buffer, boundary: string, destination: string) => {
  // Find the boundary in the buffer
  const boundaryIndex = buffer.indexOf(boundary);

  // Split the buffer into parts using the boundary
  const parts = buffer
    .subarray(boundaryIndex + boundary.length + 2)
    .toString()
    .split(boundary);

  const body: Record<string, any> = {
    files: [],
  };

  const fileWritePromises: Promise<void>[] = [];

  parts.forEach((part) => {
    // it ends with 2 CRLF
    const partHeaderEnd = part.indexOf("\r\n\r\n");
    const partHeader = part.slice(0, partHeaderEnd).toString();

    const { name, file } = parsePartHeader(partHeader);

    const partBody = part.slice(partHeaderEnd + 4, part.lastIndexOf("\r\n"));

    if (file?.filename) {
      const filename = file.filename;
      const filePath = path.join(destination, filename);

      const fwp = fs.promises.writeFile(filePath, partBody);
      fwp.then(() => {
        body.files.push({
          name,
          filename,
          "content-type": file["content-type"],
          filePath,
        });
      });

      fileWritePromises.push(fwp);
    } else if (name) {
      body[name] = partBody;
    }
  });

  await Promise.all(fileWritePromises);

  return body;
};
