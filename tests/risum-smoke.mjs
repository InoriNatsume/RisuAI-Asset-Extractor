import assert from "node:assert/strict";

import { encodeRPack } from "../src/core/rpack.js";
import { parseRisumBytes } from "../src/core/risum.js";

const modulePayload = {
  type: "risuModule",
  module: {
    name: "Smoke Module",
    assets: [
      ["background", "", "png"],
      ["voice", "", "mp3"]
    ]
  }
};

const moduleBytes = new TextEncoder().encode(JSON.stringify(modulePayload));
const assetA = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
const assetB = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]);

const encodedMain = encodeRPack(moduleBytes);
const encodedAssetA = encodeRPack(assetA);
const encodedAssetB = encodeRPack(assetB);

const risumBytes = concatBytes(
  Uint8Array.of(0x6f, 0x00),
  writeUint32LE(encodedMain.length),
  encodedMain,
  Uint8Array.of(0x01),
  writeUint32LE(encodedAssetA.length),
  encodedAssetA,
  Uint8Array.of(0x01),
  writeUint32LE(encodedAssetB.length),
  encodedAssetB,
  Uint8Array.of(0x00)
);

const parsed = parseRisumBytes(risumBytes, { fileName: "smoke.risum" });

assert.equal(parsed.title, "Smoke Module");
assert.equal(parsed.assets.length, 2);
assert.equal(parsed.assets[0].ext, "png");
assert.equal(parsed.assets[1].ext, "mp3");
assert.equal(parsed.assets[0].downloadName, "background.png");
assert.equal(parsed.assets[1].downloadName, "voice.mp3");

console.log("risum smoke test passed");

function writeUint32LE(value) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value, true);
  return bytes;
}

function concatBytes(...parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}
