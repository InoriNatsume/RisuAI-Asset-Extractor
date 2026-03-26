/**
 * 이미지 메타데이터 추출 모듈
 * - PNG 텍스트 청크 (tEXt, zTXt, iTXt)
 * - 스텔스 EXIF (NAI 스테가노그래피)
 */

import type { PngTextChunks, StealthBitsResult, ExtractedMetadata } from './types';
import { detectModelFromMeta, extractComfyPayload } from './detect';
import { parseNovelAI } from './schema/novelai';
import { parseComfyPrompt, parseComfyWorkflow } from './schema/comfyui';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// 스텔스 시그니처
const SIG_ALPHA = 'stealth_pnginfo';
const SIG_ALPHA_COMP = 'stealth_pngcomp';
const SIG_RGB = 'stealth_rgbinfo';
const SIG_RGB_COMP = 'stealth_rgbcomp';

/**
 * 이미지에서 통합 메타데이터 추출
 */
export async function extractImageMetadata(source: File | Blob | ArrayBuffer | string): Promise<ExtractedMetadata> {
  // 버퍼 획득
  const buffer = await getArrayBuffer(source);
  const bytes = new Uint8Array(buffer);
  
  // 실제 파일 형식 감지 (magic bytes)
  const format = detectImageFormat(bytes);
  console.log('[exif] 이미지 형식 감지:', format, '(버퍼 크기:', buffer.byteLength, ')');
  
  // PNG 텍스트 청크 추출 (PNG만)
  let pngText: PngTextChunks = {};
  if (format === 'png') {
    pngText = parsePngTextChunks(buffer);
    console.log('[exif] PNG 텍스트 청크:', Object.keys(pngText));
  } else {
    console.log('[exif] PNG가 아님 - 텍스트 청크 건너뜀');
  }
  
  // 스텔스 EXIF 추출 - 모든 이미지 형식에서 시도
  // NAI는 PNG, JPG, WEBP 등 모든 형식에 스텔스 메타데이터를 삽입할 수 있음
  let stealthExif: unknown = null;
  const mimeType = getMimeTypeFromFormat(format);
  stealthExif = await extractStealthExifFromBuffer(buffer, mimeType);
  
  // 모델 탐지
  const detection = detectModelFromMeta(pngText, stealthExif, null);
  console.log('[exif] 모델 탐지:', detection);
  
  // 정규화
  let normalized: ExtractedMetadata['normalized'] = null;
  
  if (detection.kind === 'nai' && stealthExif) {
    normalized = parseNovelAI(stealthExif);
  } else if (detection.kind === 'comfy') {
    const { prompt, workflow } = extractComfyPayload(pngText);
    console.log('[exif] ComfyUI payload:', { hasPrompt: !!prompt, hasWorkflow: !!workflow });
    if (prompt) {
      normalized = parseComfyPrompt(prompt);
    }
  }
  
  return {
    pngText,
    stealthExif,
    standardExif: null,
    modelKind: detection.kind,
    modelReason: detection.reason,
    normalized,
  };
}

/**
 * 버퍼에서 스텔스 EXIF 추출
 */
async function extractStealthExifFromBuffer(buffer: ArrayBuffer, mimeType: string): Promise<unknown> {
  try {
    const bytes = new Uint8Array(buffer);
    console.log('[exif] extractStealthExifFromBuffer 시작:', {
      bufferSize: buffer.byteLength,
      mimeType,
      firstBytes: Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
    
    const imageData = await loadImageData(bytes, mimeType);
    if (!imageData) {
      console.log('[exif] ImageData 로드 실패');
      return null;
    }
    
    console.log('[exif] ImageData 로드 완료:', {
      width: imageData.width,
      height: imageData.height,
      dataLength: imageData.data.length
    });
    
    const result = await extractStealthExif(imageData);
    console.log('[exif] 스텔스 EXIF 결과:', result ? 'found' : 'null', result);
    return result;
  } catch (e) {
    console.error('[exif] extractStealthExifFromBuffer 오류:', e);
    return null;
  }
}

async function getArrayBuffer(source: File | Blob | ArrayBuffer | string): Promise<ArrayBuffer> {
  if (source instanceof ArrayBuffer) return source;
  if (source instanceof Blob) return source.arrayBuffer();
  if (typeof source === 'string') {
    // URL 또는 data URL
    if (source.startsWith('data:')) {
      const base64 = source.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    const res = await fetch(source);
    return res.arrayBuffer();
  }
  throw new Error('Invalid source type');
}

function isPngBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  return isPng(bytes);
}

/**
 * PNG 텍스트 청크 추출
 */
export function parsePngTextChunks(buffer: ArrayBuffer): PngTextChunks {
  const bytes = new Uint8Array(buffer);
  if (!isPng(bytes)) return {};

  const decoderLatin1 = new TextDecoder('latin1');
  const decoderUtf8 = new TextDecoder('utf-8');
  const out: PngTextChunks = {};

  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;

    if (type === 'tEXt') {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const sep = chunk.indexOf(0);
      if (sep > 0) {
        const key = decoderLatin1.decode(chunk.subarray(0, sep));
        const value = decoderLatin1.decode(chunk.subarray(sep + 1));
        pushValue(out, key, value);
      }
    }

    if (type === 'zTXt') {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const sep = chunk.indexOf(0);
      if (sep > 0 && chunk.length >= sep + 2) {
        const key = decoderLatin1.decode(chunk.subarray(0, sep));
        const compMethod = chunk[sep + 1];
        if (compMethod === 0) {
          const compressed = chunk.subarray(sep + 2);
          const value = inflateToString(compressed);
          if (value !== null) pushValue(out, key, value);
        }
      }
    }

    if (type === 'iTXt') {
      const chunk = bytes.subarray(dataStart, dataEnd);
      const keyEnd = chunk.indexOf(0);
      if (keyEnd > 0 && chunk.length >= keyEnd + 3) {
        const key = decoderLatin1.decode(chunk.subarray(0, keyEnd));
        const compressionFlag = chunk[keyEnd + 1];
        const compressionMethod = chunk[keyEnd + 2];
        let idx = keyEnd + 3;
        idx = advanceToNull(chunk, idx);
        idx = advanceToNull(chunk, idx);

        const textBytes = chunk.subarray(idx);
        if (compressionFlag === 1 && compressionMethod === 0) {
          const value = inflateToString(textBytes);
          if (value !== null) pushValue(out, key, value);
        } else {
          const value = decoderUtf8.decode(textBytes);
          pushValue(out, key, value);
        }
      }
    }

    if (type === 'IEND') break;
    offset = dataEnd + 4;
  }

  return out;
}

/**
 * 스텔스 EXIF 추출 (NAI 스테가노그래피)
 */
export function extractStealthBits(imageData: ImageData): StealthBitsResult | null {
  const { data, width, height } = imageData;
  let mode: 'alpha' | 'rgb' | null = null;
  let compressed = false;
  let binaryData = '';
  let bufferA = '';
  let bufferRGB = '';
  let indexA = 0;
  let indexRGB = 0;
  let sigConfirmed = false;
  let confirmingSignature = true;
  let readingParamLen = false;
  let readingParam = false;
  let readEnd = false;
  let paramLen = 0;
  
  let debugLogOnce = true;

  // Column-first 순회 (NAI 방식)
  for (let x = 0; x < width && !readEnd; x++) {
    for (let y = 0; y < height && !readEnd; y++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      bufferA += (a & 1).toString();
      indexA += 1;

      bufferRGB += (r & 1).toString();
      bufferRGB += (g & 1).toString();
      bufferRGB += (b & 1).toString();
      indexRGB += 3;

      if (confirmingSignature) {
        if (indexA === SIG_ALPHA.length * 8) {
          const decoded = binToUtf8(bufferA);
          if (debugLogOnce) {
            console.log('[exif] Alpha signature check:', { decoded, expected: SIG_ALPHA, match: decoded === SIG_ALPHA || decoded === SIG_ALPHA_COMP });
          }
          if (decoded === SIG_ALPHA || decoded === SIG_ALPHA_COMP) {
            confirmingSignature = false;
            sigConfirmed = true;
            readingParamLen = true;
            mode = 'alpha';
            compressed = decoded === SIG_ALPHA_COMP;
            bufferA = '';
            indexA = 0;
          }
        }
        if (confirmingSignature && indexRGB === SIG_RGB.length * 8) {
          const decoded = binToUtf8(bufferRGB);
          if (debugLogOnce) {
            console.log('[exif] RGB signature check:', { decoded, expected: SIG_RGB, match: decoded === SIG_RGB || decoded === SIG_RGB_COMP });
            debugLogOnce = false;
          }
          if (decoded === SIG_RGB || decoded === SIG_RGB_COMP) {
            confirmingSignature = false;
            sigConfirmed = true;
            readingParamLen = true;
            mode = 'rgb';
            compressed = decoded === SIG_RGB_COMP;
            bufferRGB = '';
            indexRGB = 0;
          }
        }
        if (confirmingSignature && indexA > SIG_ALPHA.length * 8 && indexRGB > SIG_RGB.length * 8) {
          readEnd = true;
        }
      } else if (readingParamLen) {
        if (mode === 'alpha') {
          if (indexA === 32) {
            paramLen = parseInt(bufferA, 2);
            readingParamLen = false;
            readingParam = true;
            bufferA = '';
            indexA = 0;
          }
        } else {
          if (indexRGB >= 33) {
            const pop = bufferRGB.slice(-1);
            bufferRGB = bufferRGB.slice(0, -1);
            paramLen = parseInt(bufferRGB, 2);
            readingParamLen = false;
            readingParam = true;
            bufferRGB = pop;
            indexRGB = 1;
          }
        }
      } else if (readingParam) {
        if (mode === 'alpha') {
          if (indexA === paramLen) {
            binaryData = bufferA;
            readEnd = true;
          }
        } else {
          if (indexRGB >= paramLen) {
            const diff = paramLen - indexRGB;
            if (diff < 0) bufferRGB = bufferRGB.slice(0, diff);
            binaryData = bufferRGB;
            readEnd = true;
          }
        }
      }
    }
  }

  if (sigConfirmed && binaryData && mode) {
    return { mode, compressed, binaryData };
  }
  return null;
}

/**
 * 스텔스 페이로드 디코딩
 */
export async function decodeStealthPayload(bitsResult: StealthBitsResult): Promise<unknown | null> {
  if (!bitsResult) return null;
  const { compressed, binaryData } = bitsResult;
  
  try {
    const byteArray = new Uint8Array(binaryData.length / 8);
    for (let i = 0; i < binaryData.length; i += 8) {
      byteArray[i / 8] = parseInt(binaryData.substring(i, i + 8), 2);
    }
    
    let text: string;
    if (compressed) {
      // DecompressionStream API 사용 (브라우저 내장)
      const decompressed = await inflateGzip(byteArray);
      if (!decompressed) return null;
      text = new TextDecoder('utf-8').decode(decompressed);
    } else {
      text = new TextDecoder('utf-8').decode(byteArray);
    }
    
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (e) {
    console.error('[exif] 스텔스 payload 디코딩 실패:', e);
    return null;
  }
}

/**
 * 이미지에서 스텔스 EXIF 추출 (통합)
 */
export async function extractStealthExif(imageData: ImageData): Promise<unknown | null> {
  console.log('[exif] extractStealthExif 시작');
  const bits = extractStealthBits(imageData);
  console.log('[exif] extractStealthBits 결과:', bits ? { mode: bits.mode, compressed: bits.compressed, dataLen: bits.binaryData.length } : 'null');
  if (!bits) return null;
  return decodeStealthPayload(bits);
}

/**
 * Uint8Array에서 ImageData 생성
 * Image + Canvas 방식 사용 (브라우저 호환성)
 */
export async function loadImageData(bytes: Uint8Array, mimeType: string): Promise<ImageData | null> {
  try {
    // ArrayBuffer를 Blob으로 변환
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([new Uint8Array(arrayBuffer)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          URL.revokeObjectURL(url);
          resolve(imageData);
        } catch (e) {
          console.error('[exif] ImageData 생성 오류:', e);
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = (e) => {
        console.error('[exif] 이미지 로드 오류:', e);
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch (e) {
    console.error('[exif] ImageData 로드 실패:', e);
    return null;
  }
}

// === 유틸리티 함수 ===

type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif' | 'unknown';

/**
 * Magic bytes로 이미지 형식 감지
 */
function detectImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length < 12) return 'unknown';
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'png';
  }
  
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'jpeg';
  }
  
  // WEBP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'webp';
  }
  
  // GIF: GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'gif';
  }
  
  // AVIF: ....ftypavif or ....ftypavis
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand.startsWith('avif') || brand.startsWith('avis')) {
      return 'avif';
    }
  }
  
  return 'unknown';
}

/**
 * 이미지 형식에서 MIME 타입 반환
 */
function getMimeTypeFromFormat(format: ImageFormat): string {
  switch (format) {
    case 'png': return 'image/png';
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'avif': return 'image/avif';
    default: return 'image/png'; // 기본값
  }
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function pushValue(out: PngTextChunks, key: string, value: string): void {
  if (!key) return;
  if (!out[key]) out[key] = [];
  out[key].push(value);
}

function advanceToNull(bytes: Uint8Array, start: number): number {
  let idx = start;
  while (idx < bytes.length && bytes[idx] !== 0) idx++;
  return idx + 1;
}

function binToUtf8(binStr: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < binStr.length; i += 8) {
    bytes.push(parseInt(binStr.substring(i, i + 8), 2));
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

/** Uint8Array를 ArrayBuffer로 안전하게 변환 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/**
 * zlib 압축 해제 (DecompressionStream API 사용)
 */
function inflateToString(compressed: Uint8Array): string | null {
  try {
    // 브라우저 DecompressionStream 사용
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(toArrayBuffer(compressed)));
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    
    // 동기적으로 처리할 수 없으므로 null 반환하고 async 버전 사용 권장
    // 여기서는 간단히 시도
    return null;
  } catch {
    return null;
  }
}

/**
 * zlib deflate 압축 해제 (async)
 */
export async function inflateDeflate(compressed: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(toArrayBuffer(compressed)));
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * gzip 압축 해제 (async)
 */
export async function inflateGzip(compressed: Uint8Array): Promise<Uint8Array | null> {
  try {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(toArrayBuffer(compressed)));
    writer.close();
    
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch {
    return null;
  }
}
