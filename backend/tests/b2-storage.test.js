import assert from "node:assert/strict";
import test from "node:test";

import { downloadRemoteAsset } from "../src/services/b2Storage.js";

test("downloadRemoteAsset decodes base64 data URLs for image fallbacks", async () => {
  const asset = await downloadRemoteAsset("data:image/png;base64,aGVsbG8=");

  assert.equal(asset.mimeType, "image/png");
  assert.equal(asset.bytes.toString("utf8"), "hello");
  assert.equal(asset.fileSize, 5);
});
