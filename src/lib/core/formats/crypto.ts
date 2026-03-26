/**
 * AES-GCM Encryption/Decryption
 * risup/risupreset 파일용 암호화
 * 
 * 참조: RisuAI_Format_Specification.md
 */

// 프리셋 암호화 키 (RisuAI 하드코딩)
const PRESET_SECRET = 'risupreset';

// IV: 12바이트 0
const PRESET_IV = new Uint8Array(12);

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/**
 * 문자열에서 AES 키 생성
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  // SHA-256 해시로 32바이트 키 생성
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * AES-GCM 암호화
 * @param data 원본 데이터
 * @param secret 암호화 키 (기본값: 'risupreset')
 * @returns 암호화된 데이터
 */
export async function encryptAesGcm(
  data: Uint8Array,
  secret: string = PRESET_SECRET
): Promise<Uint8Array> {
  const key = await deriveKey(secret);
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: PRESET_IV
    },
    key,
    toArrayBuffer(data)
  );
  
  return new Uint8Array(encrypted);
}

/**
 * AES-GCM 복호화
 * @param data 암호화된 데이터
 * @param secret 암호화 키 (기본값: 'risupreset')
 * @returns 복호화된 데이터
 */
export async function decryptAesGcm(
  data: Uint8Array,
  secret: string = PRESET_SECRET
): Promise<Uint8Array> {
  const key = await deriveKey(secret);
  
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: PRESET_IV
      },
      key,
      toArrayBuffer(data)
    );
    
    return new Uint8Array(decrypted);
  } catch (error) {
    throw new Error(`AES-GCM decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * 프리셋 암호화 (편의 함수)
 */
export async function encryptPreset(data: Uint8Array): Promise<Uint8Array> {
  return encryptAesGcm(data, PRESET_SECRET);
}

/**
 * 프리셋 복호화 (편의 함수)
 */
export async function decryptPreset(data: Uint8Array): Promise<Uint8Array> {
  return decryptAesGcm(data, PRESET_SECRET);
}
