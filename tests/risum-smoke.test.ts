import { describe, expect, it } from 'vitest';

import { rpackEncode } from '../src/lib/core/formats/rpack';
import { parseRisum } from '../src/lib/core/formats/risum';

describe('risum smoke', () => {
  it('파서가 기본 모듈과 에셋 2개를 읽는다', () => {
    const modulePayload = {
      type: 'risuModule',
      module: {
        name: 'Smoke Module',
        assets: [
          ['background', '', 'png'],
          ['voice', '', 'mp3']
        ]
      }
    };

    const moduleBytes = new TextEncoder().encode(JSON.stringify(modulePayload));
    const assetA = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
    const assetB = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0]);

    const encodedMain = rpackEncode(moduleBytes);
    const encodedAssetA = rpackEncode(assetA);
    const encodedAssetB = rpackEncode(assetB);

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

    const parsed = parseRisum(risumBytes);

    expect(parsed.module.name).toBe('Smoke Module');
    expect(parsed.assets).toHaveLength(2);
    expect(parsed.assets[0]).toEqual(assetA);
    expect(parsed.assets[1]).toEqual(assetB);
  });
});

function writeUint32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value, true);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}
