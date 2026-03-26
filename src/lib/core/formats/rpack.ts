const ENCODE_MAP_HEX =
  'c40d1e0bbd2b3f55fc456ef566534f1ae0bb309486ba6bbf41506f9befdeb710611720df3289a89d6dabc990000c5dafd2c156e516649182657497ca23d652d1ffb4a0e82f8a58385a60199649dbd7c83b3e434ba56347aa6a2992f415cf623478d31d3ce2058e2a570e1bcd4c2df2402c2579480fb27ab5a76c37e69c7b547efe87dc9a02e433a2ebb12e03dd99a6b0e7d58818837cf6bee15c9fc321461f084ed076125feefd8f44eaa35e8b2809359e69cc0ac78507ad4af377e967d4da848093b64d73fa27267f04c6fbf1723951c236a968acf8edc5b9cbce75a43d81d942701c9511bcd88c98f959a113f7147db3ec71c0e38df001ae5b310624223ab8';

const encodeMap = hexToBytes(ENCODE_MAP_HEX);
const decodeMap = buildDecodeMap(encodeMap);

export function rpackEncode(data: Uint8Array): Uint8Array {
  return remapBytes(data, encodeMap);
}

export function rpackDecode(data: Uint8Array): Uint8Array {
  return remapBytes(data, decodeMap);
}

export const encodeRPack = rpackEncode;
export const decodeRPack = rpackDecode;

export function validateRpackTable(): boolean {
  for (let index = 0; index < 256; index += 1) {
    if (decodeMap[encodeMap[index]] !== index) {
      return false;
    }
  }
  return true;
}

function remapBytes(data: Uint8Array, map: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);

  for (let index = 0; index < data.length; index += 1) {
    result[index] = map[data[index]];
  }

  return result;
}

function buildDecodeMap(sourceEncodeMap: Uint8Array): Uint8Array {
  if (sourceEncodeMap.length !== 256) {
    throw new Error(`Invalid RPack encode map length: ${sourceEncodeMap.length}`);
  }

  const result = new Uint8Array(256);
  const seen = new Set<number>();

  for (let index = 0; index < sourceEncodeMap.length; index += 1) {
    const encoded = sourceEncodeMap[index];
    if (seen.has(encoded)) {
      throw new Error(`Duplicate RPack mapping for byte ${encoded}`);
    }
    seen.add(encoded);
    result[encoded] = index;
  }

  if (seen.size !== 256) {
    throw new Error(`Incomplete RPack encode map: ${seen.size}`);
  }

  return result;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length for RPack map.');
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }
  return bytes;
}
