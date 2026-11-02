import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTransientSocketError } from "./http.js";

describe("http", () => {
  describe("isTransientSocketError", () => {
    it("accepts undici HTTP/2 socket codes", () => {
      assert.equal(
        isTransientSocketError({ code: "UND_ERR_SOCKET", message: "other side closed" }),
        true,
      );
      assert.equal(isTransientSocketError({ code: "ECONNRESET", syscall: "read" }), true);
      assert.equal(
        isTransientSocketError({ code: "UND_ERR_INFO", message: "socket idle timeout" }),
        true,
      );
    });

    it("rejects unrelated errors", () => {
      assert.equal(isTransientSocketError(new Error("Agent failed")), false);
      assert.equal(isTransientSocketError({ code: "ENOENT" }), false);
      assert.equal(isTransientSocketError(null), false);
    });
  });
});
