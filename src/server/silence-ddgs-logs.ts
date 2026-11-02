import fs from "node:fs";
import { Writable } from "node:stream";

const BLOCKED_LOGS = new Set(["combined.log", "error.log"]);

function isBlockedLog(filePath: fs.PathLike): boolean {
  const name = String(filePath).split(/[\\/]/).pop() ?? "";
  return BLOCKED_LOGS.has(name);
}

const createWriteStream = fs.createWriteStream.bind(fs);

fs.createWriteStream = ((
  filePath: fs.PathLike,
  options?: Parameters<typeof fs.createWriteStream>[1],
) => {
  if (isBlockedLog(filePath)) {
    return new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as fs.WriteStream;
  }
  return createWriteStream(filePath, options);
}) as typeof fs.createWriteStream;
