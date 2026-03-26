/**
 * NovelAI 메타데이터 스키마 파서
 * - V3 포맷 지원
 * - V4 포맷 지원 (v4_prompt, v4_negative_prompt)
 * - char_captions → char_prompts 변환
 */

import type { NAINormalizedMeta, CharPrompt } from '../types';

/**
 * NAI 원시 데이터를 정규화된 구조로 변환
 */
export function parseNovelAI(raw: unknown): NAINormalizedMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  
  let obj = raw as Record<string, unknown>;
  
  // Comment 필드가 JSON 문자열인 경우 파싱 (NAI 스텔스 형식)
  // NAI는 메타데이터를 Comment 필드에 JSON으로 저장
  if (typeof obj.Comment === 'string') {
    try {
      const parsed = JSON.parse(obj.Comment);
      // Comment의 내용을 병합 (Comment 내부가 실제 파라미터)
      obj = { ...obj, ...parsed };
    } catch {
      // JSON 파싱 실패 시 무시
    }
  }
  
  // 프롬프트 처리
  const { positive, negative, isV4 } = parsePrompts(obj);
  
  // 캐릭터 프롬프트 처리
  const charPrompts = parseCharPrompts(obj);
  
  // 기본 파라미터
  const params: NAINormalizedMeta = {
    positive,
    negative,
    isV4,
    charPrompts,
    
    steps: parseNumber(obj.steps),
    scale: parseNumber(obj.scale) ?? parseNumber(obj.cfg_scale),
    sampler: parseString(obj.sampler),
    seed: parseSeed(obj.seed),
    
    width: parseNumber(obj.width),
    height: parseNumber(obj.height),
    
    model: parseString(obj.model) ?? parseString(obj.Source),
    software: parseString(obj.Software) ?? parseString(obj.Source),
    
    // V4 특화 파라미터
    noiseSchedule: parseString(obj.noise_schedule),
    smea: parseBoolean(obj.sm) ?? parseBoolean(obj.smea),
    smeaDyn: parseBoolean(obj.sm_dyn) ?? parseBoolean(obj.smea_dyn),
    
    // 고급 파라미터
    ucPreset: parseNumber(obj.uc_preset),
    qualityTags: parseBoolean(obj.qualityTags) ?? parseBoolean(obj.quality_tags),
    characterPromptMode: parseString(obj.characterPromptMode),
    
    // 레퍼런스 이미지
    referenceImages: parseReferenceImages(obj),
    
    // 추가 데이터
    extras: collectExtras(obj),
    raw: obj,
  };
  
  return params;
}

/**
 * 프롬프트 파싱 (V3/V4 구분)
 */
function parsePrompts(obj: Record<string, unknown>): {
  positive: string;
  negative: string;
  isV4: boolean;
} {
  // V4 체크
  const hasV4Prompt = 'v4_prompt' in obj || 'v4_negative_prompt' in obj;
  
  if (hasV4Prompt) {
    // V4 포맷
    const v4Positive = parseV4Prompt(obj.v4_prompt);
    const v4Negative = parseV4Prompt(obj.v4_negative_prompt);
    
    return {
      positive: v4Positive || parseString(obj.prompt) || '',
      negative: v4Negative || parseString(obj.uc) || '',
      isV4: true,
    };
  }
  
  // V3 포맷
  return {
    positive: parseString(obj.prompt) || '',
    negative: parseString(obj.uc) || parseString(obj.negative_prompt) || '',
    isV4: false,
  };
}

/**
 * V4 프롬프트 객체 파싱
 */
function parseV4Prompt(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  
  const obj = value as Record<string, unknown>;
  
  // caption 키가 있는 경우
  if (typeof obj.caption === 'object' && obj.caption !== null) {
    const caption = obj.caption as Record<string, unknown>;
    if (typeof caption.base_caption === 'string') {
      return caption.base_caption;
    }
  }
  
  // 문자열인 경우
  if (typeof obj.caption === 'string') {
    return obj.caption;
  }
  
  return null;
}

/**
 * 캐릭터 프롬프트 파싱
 */
function parseCharPrompts(obj: Record<string, unknown>): CharPrompt[] {
  const result: CharPrompt[] = [];
  
  // V4 스타일: v4_prompt.caption.char_captions
  const v4Prompt = obj.v4_prompt;
  if (v4Prompt && typeof v4Prompt === 'object') {
    const v4 = v4Prompt as Record<string, unknown>;
    const caption = v4.caption;
    if (caption && typeof caption === 'object') {
      const captionObj = caption as Record<string, unknown>;
      const charCaptions = captionObj.char_captions;
      if (Array.isArray(charCaptions)) {
        for (let i = 0; i < charCaptions.length; i++) {
          const item = charCaptions[i];
          if (item && typeof item === 'object') {
            const parsed = parseCharCaption(item as Record<string, unknown>, i);
            if (parsed) result.push(parsed);
          }
        }
      }
    }
    
    // use_coords에서 위치 정보 병합
    if (Array.isArray(v4.use_coords)) {
      for (let i = 0; i < v4.use_coords.length && i < result.length; i++) {
        const coords = v4.use_coords[i];
        if (coords && typeof coords === 'object') {
          const c = coords as Record<string, unknown>;
          result[i].position = {
            x: parseNumber(c.x) ?? 0,
            y: parseNumber(c.y) ?? 0,
            w: parseNumber(c.w) ?? parseNumber(c.width) ?? 0,
            h: parseNumber(c.h) ?? parseNumber(c.height) ?? 0,
          };
        }
      }
    }
  }
  
  // 결과가 있으면 반환
  if (result.length > 0) return result;
  
  // Fallback: 루트 레벨 char_captions (구형 방식)
  const charCaptions = obj.char_captions;
  if (charCaptions && typeof charCaptions === 'object') {
    if (Array.isArray(charCaptions)) {
      for (let i = 0; i < charCaptions.length; i++) {
        const item = charCaptions[i];
        if (item && typeof item === 'object') {
          const parsed = parseCharCaption(item as Record<string, unknown>, i);
          if (parsed) result.push(parsed);
        }
      }
    } else {
      // 객체 형태 (키가 캐릭터 이름)
      const entries = Object.entries(charCaptions as Record<string, unknown>);
      let idx = 0;
      for (const [name, value] of entries) {
        if (value && typeof value === 'object') {
          const parsed = parseCharCaption(value as Record<string, unknown>, idx, name);
          if (parsed) result.push(parsed);
          idx++;
        }
      }
    }
  }
  
  return result;
}

/**
 * 개별 캐릭터 캡션 파싱
 */
function parseCharCaption(obj: Record<string, unknown>, index: number, fallbackName?: string): CharPrompt | null {
  // 캡션 추출 - char_caption 우선 (NAI V4 표준)
  let caption = '';
  if (typeof obj.char_caption === 'string') {
    caption = obj.char_caption;
  } else if (typeof obj.caption === 'string') {
    caption = obj.caption;
  } else if (typeof obj.base_caption === 'string') {
    caption = obj.base_caption;
  }
  
  if (!caption) return null;
  
  // 이름 추출
  const name = parseString(obj.name) || parseString(obj.char_name) || fallbackName || `Char ${index + 1}`;
  
  // 센터 좌표
  const centers = obj.centers as number[] | undefined;
  const cx = parseNumber(centers?.[0]) ?? parseNumber(obj.center_x);
  const cy = parseNumber(centers?.[1]) ?? parseNumber(obj.center_y);
  
  return {
    name,
    caption,
    center: cx !== undefined && cy !== undefined ? { x: cx, y: cy } : undefined,
  };
}

/**
 * 레퍼런스 이미지 파싱
 */
function parseReferenceImages(obj: Record<string, unknown>): string[] | undefined {
  const refImages = obj.reference_images || obj.referenceImages;
  if (!Array.isArray(refImages)) return undefined;
  return refImages.filter(r => typeof r === 'string');
}

/**
 * 기타 파라미터 수집 (정규화 안된 것들)
 */
function collectExtras(obj: Record<string, unknown>): Record<string, unknown> {
  const knownKeys = new Set([
    'prompt', 'uc', 'negative_prompt',
    'v4_prompt', 'v4_negative_prompt',
    'char_captions',
    'steps', 'scale', 'cfg_scale', 'sampler', 'seed',
    'width', 'height',
    'model', 'Source', 'Software',
    'noise_schedule', 'sm', 'sm_dyn', 'smea', 'smea_dyn',
    'uc_preset', 'qualityTags', 'quality_tags', 'characterPromptMode',
    'reference_images', 'referenceImages',
  ]);
  
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!knownKeys.has(key) && value !== undefined && value !== null) {
      extras[key] = value;
    }
  }
  
  return Object.keys(extras).length > 0 ? extras : {};
}

// === 파싱 유틸리티 ===

function parseString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function parseSeed(value: unknown): number | string | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // 큰 숫자는 문자열로 유지
    if (/^\d{15,}$/.test(value)) return value;
    const n = Number(value);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 1) return true;
  if (value === 0) return false;
  return undefined;
}
