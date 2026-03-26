import { gzipSync, gunzipSync } from 'fflate';
import { pack, unpack } from 'msgpackr';

import { decryptPreset, encryptPreset } from './crypto';
import { rpackDecode, rpackEncode } from './rpack';
import type { RisuPreset } from '../types/preset';

const GZIP_SIGNATURE = new Uint8Array([0x1f, 0x8b, 0x08]);

interface PresetContainer {
  preset?: Uint8Array;
  pres?: Uint8Array;
  presetVersion?: number;
  type?: string;
  [key: string]: unknown;
}

export interface RisupResult {
  preset: RisuPreset;
  format: 'risup' | 'risupreset';
}

export class RisupParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'RisupParseError';
  }
}

export async function parseRisup(data: Uint8Array): Promise<RisupResult> {
  const preset = await decodePresetContainer(data, 'risup');
  return { preset, format: 'risup' };
}

export async function parseRisupreset(data: Uint8Array): Promise<RisupResult> {
  const preset = await decodePresetContainer(data, 'risupreset');
  return { preset, format: 'risupreset' };
}

export async function exportRisup(preset: RisuPreset): Promise<Uint8Array> {
  return encodePresetContainer(preset, 'risup');
}

export async function exportRisupreset(preset: RisuPreset): Promise<Uint8Array> {
  return encodePresetContainer(preset, 'risupreset');
}

export async function parsePresetAuto(
  data: Uint8Array,
  fileName?: string
): Promise<RisupResult> {
  const lowerName = fileName?.toLowerCase() ?? '';
  if (lowerName.endsWith('.risupreset')) {
    return parseRisupreset(data);
  }
  if (lowerName.endsWith('.risup')) {
    return parseRisup(data);
  }
  if (isRisupFile(data)) {
    return parseRisup(data);
  }
  if (isRisupresetFile(data)) {
    return parseRisupreset(data);
  }
  throw new RisupParseError('Unknown preset file format.');
}

export function isRisupFile(data: Uint8Array): boolean {
  if (data.length < GZIP_SIGNATURE.length) {
    return false;
  }

  try {
    const headerBytes = rpackDecode(data.slice(0, GZIP_SIGNATURE.length));
    return startsWith(headerBytes, GZIP_SIGNATURE);
  } catch {
    return false;
  }
}

export function isRisupresetFile(data: Uint8Array): boolean {
  return data.length >= GZIP_SIGNATURE.length && startsWith(data, GZIP_SIGNATURE);
}

async function decodePresetContainer(
  inputBytes: Uint8Array,
  format: 'risup' | 'risupreset'
): Promise<RisuPreset> {
  try {
    const wrappedBytes = format === 'risup' ? rpackDecode(inputBytes) : inputBytes;
    if (!startsWith(wrappedBytes, GZIP_SIGNATURE)) {
      throw new RisupParseError(
        `입력 파일의 ${format} 헤더가 올바르지 않습니다. 확장자와 실제 포맷을 확인해주세요.`
      );
    }

    const outer = unpack(gunzipSync(wrappedBytes)) as PresetContainer;
    const outerType = typeof outer.type === 'string' ? outer.type : '';
    const presetVersion =
      typeof outer.presetVersion === 'number' ? outer.presetVersion : -1;

    if (
      !(
        (presetVersion === 0 || presetVersion === 2) &&
        (outerType === 'preset' || outerType === 'risupreset')
      )
    ) {
      throw new RisupParseError(
        `알 수 없는 risup 포맷입니다 (presetVersion: ${String(outer.presetVersion)})`
      );
    }

    const encrypted = asUint8Array(outer.preset ?? outer.pres);
    const decrypted = await decryptPreset(encrypted);
    return unpack(decrypted) as RisuPreset;
  } catch (error) {
    if (error instanceof RisupParseError) {
      throw error;
    }
    throw new RisupParseError(`Failed to parse ${format} file.`, error);
  }
}

async function encodePresetContainer(
  preset: RisuPreset,
  format: 'risup' | 'risupreset'
): Promise<Uint8Array> {
  const innerPacked = pack(preset);
  const encrypted = await encryptPreset(innerPacked);
  const outer = pack({
    presetVersion: 2,
    type: 'preset',
    preset: encrypted
  });
  const compressed = gzipSync(outer);

  return format === 'risup' ? rpackEncode(compressed) : compressed;
}

function asUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  throw new RisupParseError('risup 암호화 데이터가 Uint8Array 형식이 아닙니다.');
}

function startsWith(source: Uint8Array, signature: Uint8Array): boolean {
  if (source.length < signature.length) {
    return false;
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (source[index] !== signature[index]) {
      return false;
    }
  }

  return true;
}
