import JSZip from 'jszip';

import type { CharacterCard, CharacterCardV3 } from '../types/character';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOI = new Uint8Array([0xff, 0xd8, 0xff]);
const ZIP_LOCAL_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const utf8Decoder = new TextDecoder('utf-8');
const latin1Decoder = new TextDecoder('latin1');

export type BotContainerKind = 'zip-charx' | 'jpeg-zip' | 'png-chunks';

export interface BotContainerInfo {
  kind: BotContainerKind;
  zipOffset?: number;
}

export interface CharxResult {
  card: CharacterCard;
  assets: Map<string, Uint8Array>;
  raw: Record<string, Uint8Array>;
}

export class CharxParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'CharxParseError';
  }
}

export async function parseCharx(data: Uint8Array): Promise<CharxResult> {
  try {
    if (!isCharxFile(data)) {
      throw new CharxParseError('Invalid charx: ZIP signature not found at offset 0');
    }

    return parseZipContainer(data);
  } catch (error) {
    if (error instanceof CharxParseError) {
      throw error;
    }
    throw new CharxParseError('Failed to parse charx file.', error);
  }
}

export async function parseJpeg(data: Uint8Array): Promise<CharxResult> {
  if (!isJpegFile(data)) {
    throw new CharxParseError('Invalid JPEG: bad signature');
  }

  const zipOffset = findZipStart(data);
  if (zipOffset < 0) {
    throw new CharxParseError('Invalid JPEG card: ZIP payload not found');
  }

  return parseZipContainer(data.slice(zipOffset));
}

export async function parsePng(data: Uint8Array): Promise<CharxResult> {
  try {
    assertPngSignature(data);
    const textChunks = listTextChunks(data);

    let selectedCardChunk: ParsedPngTextChunk | null = null;
    for (const chunk of textChunks) {
      if (chunk.key === 'ccv3') {
        selectedCardChunk = chunk;
      } else if (chunk.key === 'chara' && !selectedCardChunk) {
        selectedCardChunk = chunk;
      }
    }

    if (!selectedCardChunk) {
      throw new CharxParseError('Invalid PNG card: no chara/ccv3 tEXt chunk found');
    }

    const cardBytes = decodeBase64TextChunk(selectedCardChunk.value);
    const card = JSON.parse(utf8Decoder.decode(cardBytes)) as CharacterCard;
    const assets = new Map<string, Uint8Array>();

    for (const chunk of textChunks) {
      const assetIndex = extractAssetChunkIndex(chunk.key);
      if (assetIndex == null) {
        continue;
      }
      assets.set(assetIndex, decodeBase64TextChunk(chunk.value));
    }

    return {
      card,
      assets,
      raw: {}
    };
  } catch (error) {
    if (error instanceof CharxParseError) {
      throw error;
    }
    throw new CharxParseError('Failed to parse PNG card.', error);
  }
}

export async function exportCharx(
  card: CharacterCard,
  assets: Map<string, Uint8Array> = new Map()
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('card.json', JSON.stringify(card, null, 2));

  for (const [path, value] of assets) {
    const data = extractAssetBytes(value);
    if (!data) {
      continue;
    }
    zip.file(path, data);
  }

  const buffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  return buffer;
}

export function isCharxFile(data: Uint8Array): boolean {
  return startsWith(data, ZIP_LOCAL_HEADER);
}

export function isPngFile(data: Uint8Array): boolean {
  return startsWith(data, PNG_SIGNATURE);
}

export function isJpegFile(data: Uint8Array): boolean {
  return startsWith(data, JPEG_SOI);
}

export function detectBotContainer(data: Uint8Array): BotContainerInfo {
  if (isPngFile(data)) {
    return { kind: 'png-chunks' };
  }

  if (isCharxFile(data)) {
    return { kind: 'zip-charx', zipOffset: 0 };
  }

  if (isJpegFile(data)) {
    const zipOffset = findZipStart(data);
    if (zipOffset >= 0) {
      return { kind: 'jpeg-zip', zipOffset };
    }
  }

  throw new CharxParseError(
    '지원하지 않는 봇 컨테이너입니다. ZIP형 CharX, JPEG+ZIP, PNG 청크만 지원합니다.'
  );
}

export function normalizeToV3(card: CharacterCard): CharacterCardV3 {
  if (card.spec === 'chara_card_v3') {
    return card;
  }

  const v2 = card;
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: v2.data.name,
      description: v2.data.description,
      personality: v2.data.personality,
      scenario: v2.data.scenario,
      first_mes: v2.data.first_mes,
      mes_example: v2.data.mes_example,
      creator_notes: v2.data.creator_notes,
      system_prompt: v2.data.system_prompt,
      post_history_instructions: v2.data.post_history_instructions,
      alternate_greetings: v2.data.alternate_greetings,
      character_book: v2.data.character_book,
      tags: v2.data.tags,
      creator: v2.data.creator,
      character_version: v2.data.character_version,
      extensions: v2.data.extensions
    }
  };
}

async function parseZipContainer(zipData: Uint8Array): Promise<CharxResult> {
  const zip = await JSZip.loadAsync(zipData);
  const raw: Record<string, Uint8Array> = {};
  const assets = new Map<string, Uint8Array>();

  let card: CharacterCard | null = null;

  for (const [entryName, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) {
      continue;
    }

    const safePath = sanitizeArchiveEntryPath(entryName);
    const bytes = await zipEntry.async('uint8array');
    raw[safePath] = bytes;

    if (safePath === 'card.json') {
      card = JSON.parse(utf8Decoder.decode(bytes)) as CharacterCard;
      continue;
    }

    assets.set(safePath, bytes);
  }

  if (!card) {
    throw new CharxParseError('Invalid charx: card.json not found');
  }

  return { card, assets, raw };
}

function extractAssetBytes(
  value: Uint8Array | { data?: Uint8Array } | unknown
): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value && typeof value === 'object' && 'data' in value) {
    const candidate = (value as { data?: unknown }).data;
    if (candidate instanceof Uint8Array) {
      return candidate;
    }
  }

  return null;
}

function findZipStart(data: Uint8Array): number {
  for (let index = 0; index <= data.length - ZIP_LOCAL_HEADER.length; index += 1) {
    if (
      data[index] === ZIP_LOCAL_HEADER[0] &&
      data[index + 1] === ZIP_LOCAL_HEADER[1] &&
      data[index + 2] === ZIP_LOCAL_HEADER[2] &&
      data[index + 3] === ZIP_LOCAL_HEADER[3]
    ) {
      return index;
    }
  }

  return -1;
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

function sanitizeArchiveEntryPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || /^[A-Za-z]:/.test(normalized)) {
    throw new CharxParseError(`Unsafe archive path: ${entryName}`);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new CharxParseError(`Unsafe archive path: ${entryName}`);
  }

  return normalized;
}

interface ParsedPngTextChunk {
  key: string;
  value: Uint8Array;
}

function assertPngSignature(bytes: Uint8Array): void {
  if (!startsWith(bytes, PNG_SIGNATURE)) {
    throw new CharxParseError('Invalid PNG: bad signature');
  }
}

function listTextChunks(bytes: Uint8Array): ParsedPngTextChunk[] {
  const chunks: ParsedPngTextChunk[] = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;

    if (chunkEnd > bytes.length) {
      throw new CharxParseError('Broken PNG chunk length');
    }

    if (type === 'tEXt') {
      const chunkData = bytes.slice(dataStart, dataEnd);
      const zeroIndex = chunkData.indexOf(0x00);
      if (zeroIndex >= 0) {
        chunks.push({
          key: latin1Decoder.decode(chunkData.slice(0, zeroIndex)),
          value: chunkData.slice(zeroIndex + 1)
        });
      }
    }

    offset = chunkEnd;
    if (type === 'IEND') {
      break;
    }
  }

  return chunks;
}

function decodeBase64TextChunk(value: Uint8Array): Uint8Array {
  return decodeBase64String(latin1Decoder.decode(value));
}

function extractAssetChunkIndex(key: string): string | null {
  if (!key.startsWith('chara-ext-asset_')) {
    return null;
  }

  return key.replace('chara-ext-asset_:', '').replace('chara-ext-asset_', '');
}

function decodeBase64String(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const binary = atob(clean);
    const result = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      result[index] = binary.charCodeAt(index);
    }
    return result;
  }

  return Uint8Array.from(Buffer.from(clean, 'base64'));
}

function readUint32BE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] << 24) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3]
  ) >>> 0;
}
