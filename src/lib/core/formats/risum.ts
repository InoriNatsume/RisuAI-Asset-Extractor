import { rpackDecode, rpackEncode } from './rpack';
import type { RisuModule } from '../types/module';

const RISUM_MAGIC = 0x6f;
const RISUM_VERSION = 0x00;
const ASSET_MARKER = 0x01;
const END_MARKER = 0x00;
const MODULE_TYPE = 'risuModule';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

export interface RisumResult {
  module: RisuModule;
  assets: Uint8Array[];
  version: number;
}

export class RisumParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'RisumParseError';
  }
}

export function parseRisum(data: Uint8Array): RisumResult {
  try {
    const cursor = createCursor(data);
    const magic = readByte(cursor, 'magic');
    if (magic !== RISUM_MAGIC) {
      throw new RisumParseError(
        `Invalid magic byte: 0x${magic.toString(16)} (expected 0x6F)`
      );
    }

    const version = readByte(cursor, 'version');
    if (version !== RISUM_VERSION) {
      throw new RisumParseError(`Unsupported version: ${version} (expected 0)`);
    }

    const encodedMain = readChunkPayload(cursor, 'main');
    const parsedMain = JSON.parse(textDecoder.decode(rpackDecode(encodedMain))) as {
      type?: unknown;
      module?: unknown;
    };

    if (parsedMain.type !== MODULE_TYPE) {
      throw new RisumParseError(
        `Invalid module type: "${String(parsedMain.type)}" (expected "risuModule")`
      );
    }

    const assets: Uint8Array[] = [];
    while (!atEnd(cursor)) {
      const marker = readByte(cursor, 'chunk marker');
      if (marker === END_MARKER) {
        break;
      }
      if (marker !== ASSET_MARKER) {
        throw new RisumParseError(
          `Unexpected marker: 0x${marker.toString(16)} at pos ${cursor.offset - 1}`
        );
      }

      assets.push(rpackDecode(readChunkPayload(cursor, 'asset')));
    }

    return {
      module: parsedMain.module as RisuModule,
      assets,
      version
    };
  } catch (error) {
    if (error instanceof RisumParseError) {
      throw error;
    }
    throw new RisumParseError('Failed to parse risum file.', error);
  }
}

export function exportRisum(
  module: RisuModule,
  assetBuffers: Uint8Array[] = []
): Uint8Array {
  const normalizedModule = cloneModuleForContainer(module);
  const mainPayload = textEncoder.encode(
    JSON.stringify({ type: MODULE_TYPE, module: normalizedModule }, null, 2)
  );
  const encodedMain = rpackEncode(mainPayload);

  let totalLength = 6 + encodedMain.length + 1;
  const encodedAssets = assetBuffers.map((assetBuffer) => {
    const encodedAsset = rpackEncode(assetBuffer);
    totalLength += 5 + encodedAsset.length;
    return encodedAsset;
  });

  const output = new Uint8Array(totalLength);
  let offset = 0;

  output[offset] = RISUM_MAGIC;
  offset += 1;
  output[offset] = RISUM_VERSION;
  offset += 1;

  writeUint32LE(output, offset, encodedMain.length);
  offset += 4;
  output.set(encodedMain, offset);
  offset += encodedMain.length;

  for (const encodedAsset of encodedAssets) {
    output[offset] = ASSET_MARKER;
    offset += 1;
    writeUint32LE(output, offset, encodedAsset.length);
    offset += 4;
    output.set(encodedAsset, offset);
    offset += encodedAsset.length;
  }

  output[offset] = END_MARKER;
  return output;
}

export function isRisumFile(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === RISUM_MAGIC && data[1] === RISUM_VERSION;
}

export function buildAssetMap(
  module: RisuModule,
  assets: Uint8Array[]
): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  if (!Array.isArray(module.assets)) {
    return result;
  }

  for (let index = 0; index < module.assets.length && index < assets.length; index += 1) {
    const asset = module.assets[index];
    if (!Array.isArray(asset)) {
      continue;
    }

    const name = typeof asset[0] === 'string' ? asset[0] : `asset_${index}`;
    const ext = typeof asset[2] === 'string' ? asset[2] : '';
    const id = ext ? `${name}.${ext}` : name;
    result.set(id, assets[index]);
  }

  return result;
}

function cloneModuleForContainer(module: RisuModule): RisuModule {
  const cloned = structuredClone(module);

  if (!Array.isArray(cloned.assets)) {
    return cloned;
  }

  cloned.assets = cloned.assets.map((asset) => {
    if (!Array.isArray(asset)) {
      return asset;
    }
    return [asset[0], '', asset[2]];
  }) as RisuModule['assets'];

  return cloned;
}

function createCursor(data: Uint8Array): { buffer: Uint8Array; offset: number } {
  return { buffer: data, offset: 0 };
}

function atEnd(cursor: { buffer: Uint8Array; offset: number }): boolean {
  return cursor.offset >= cursor.buffer.length;
}

function readByte(
  cursor: { buffer: Uint8Array; offset: number },
  label: string
): number {
  ensureAvailable(cursor, 1, label);
  const value = cursor.buffer[cursor.offset];
  cursor.offset += 1;
  return value;
}

function readChunkPayload(
  cursor: { buffer: Uint8Array; offset: number },
  label: string
): Uint8Array {
  ensureAvailable(cursor, 4, `${label} length`);
  const length = readUint32LE(cursor.buffer, cursor.offset);
  cursor.offset += 4;
  ensureAvailable(cursor, length, `${label} payload`);
  const payload = cursor.buffer.slice(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return payload;
}

function ensureAvailable(
  cursor: { buffer: Uint8Array; offset: number },
  size: number,
  label: string
): void {
  const remaining = cursor.buffer.length - cursor.offset;
  if (remaining < size) {
    throw new RisumParseError(
      `Unexpected end of file while reading ${label}: need ${size} bytes, have ${remaining}`
    );
  }
}

function readUint32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}
