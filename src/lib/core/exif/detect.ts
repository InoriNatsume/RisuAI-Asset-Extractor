/**
 * AI 모델 탐지 모듈
 * - NAI (NovelAI) 탐지
 * - ComfyUI 탐지
 */

import type { AIModelKind, ModelDetectionResult, PngTextChunks } from './types';

/**
 * 메타데이터에서 AI 모델 종류 탐지
 */
export function detectModelFromMeta(
  pngText: PngTextChunks | null,
  stealthExif: unknown | null,
  standardExif: unknown | null
): ModelDetectionResult {
  // 1. ComfyUI 탐지 (PNG 텍스트에서)
  const comfy = detectComfyFromPngText(pngText);
  if (comfy.matched) return { kind: 'comfy', reason: comfy.reason };

  // 2. NAI 탐지 (스텔스 EXIF에서)
  const naiStealth = detectNovelAiFromExif(stealthExif);
  if (naiStealth.matched) return { kind: 'nai', reason: `stealth:${naiStealth.reason}` };

  // 3. NAI 탐지 (표준 EXIF에서)
  const naiStandard = detectNovelAiFromExif(standardExif);
  if (naiStandard.matched) return { kind: 'nai', reason: naiStandard.reason };

  // 4. A1111 탐지 (PNG parameters에서)
  const a1111 = detectA1111FromPngText(pngText);
  if (a1111.matched) return { kind: 'a1111', reason: a1111.reason };

  return { kind: 'unknown', reason: 'no-signature' };
}

/**
 * ComfyUI 탐지
 */
export function detectComfyFromPngText(pngText: PngTextChunks | null): { matched: boolean; reason: string } {
  if (!pngText || typeof pngText !== 'object') return { matched: false, reason: 'no-png-text' };
  const keys = Object.keys(pngText);
  if (keys.length === 0) return { matched: false, reason: 'no-png-text' };

  // workflow 키 탐색
  const workflowKey = keys.find(k => k.toLowerCase().includes('workflow'));
  if (workflowKey) {
    const values = pngText[workflowKey] || [];
    const parsed = values.map(tryJsonParse).find(isComfyWorkflow);
    if (parsed) return { matched: true, reason: `workflow:${workflowKey}` };
  }

  // prompt 키 탐색 (ComfyUI 스타일)
  const promptKey = keys.find(k => k.toLowerCase() === 'prompt');
  if (promptKey) {
    const values = pngText[promptKey] || [];
    const parsed = values.map(tryJsonParse).find(isComfyPrompt);
    if (parsed) return { matched: true, reason: 'prompt' };
  }

  return { matched: false, reason: 'no-comfy-signature' };
}

/**
 * NovelAI 탐지
 */
export function detectNovelAiFromExif(exif: unknown): { matched: boolean; reason: string } {
  if (!exif || typeof exif !== 'object') {
    return { matched: false, reason: 'no-exif' };
  }
  
  const obj = exif as Record<string, unknown>;
  
  // Software/Source 태그 확인
  const software = String(obj.Software || obj.software || '');
  const source = String(obj.Source || obj.source || '');
  const isNAI = /novelai/i.test(software) || /novelai/i.test(source);
  if (isNAI) return { matched: true, reason: 'novelai-tag' };

  // NAI 특유 키 확인
  const hasPrompt = typeof obj.prompt === 'string' || !!obj.v4_prompt;
  const hasNAIKeys = hasPrompt && (
    obj.steps !== undefined ||
    obj.sampler !== undefined ||
    obj.noise_schedule !== undefined ||
    obj.width !== undefined ||
    obj.height !== undefined
  );
  if (hasNAIKeys) return { matched: true, reason: 'novelai-keys' };

  return { matched: false, reason: 'no-novelai-tag' };
}

/**
 * A1111 (Stable Diffusion WebUI) 탐지
 */
export function detectA1111FromPngText(pngText: PngTextChunks | null): { matched: boolean; reason: string } {
  if (!pngText) return { matched: false, reason: 'no-png-text' };
  
  // parameters 키 확인 (A1111 스타일)
  const params = pngText['parameters']?.[0];
  if (params && typeof params === 'string') {
    // A1111 특유 패턴: "Steps: XX, Sampler: ..."
    if (/Steps:\s*\d+.*Sampler:/i.test(params)) {
      return { matched: true, reason: 'a1111-parameters' };
    }
  }
  
  return { matched: false, reason: 'no-a1111-signature' };
}

/**
 * ComfyUI에서 프롬프트/워크플로우 추출
 */
export function extractComfyPayload(pngText: PngTextChunks): { prompt: unknown | null; workflow: unknown | null } {
  let prompt: unknown = null;
  let workflow: unknown = null;
  
  const keys = Object.keys(pngText);
  
  // workflow 추출
  const workflowKey = keys.find(k => k.toLowerCase().includes('workflow'));
  if (workflowKey) {
    const values = pngText[workflowKey] || [];
    workflow = values.map(tryJsonParse).find(isComfyWorkflow) || null;
  }
  
  // prompt 추출
  const promptKey = keys.find(k => k.toLowerCase() === 'prompt');
  if (promptKey) {
    const values = pngText[promptKey] || [];
    prompt = values.map(tryJsonParse).find(isComfyPrompt) || null;
  }
  
  return { prompt, workflow };
}

// === 유틸리티 ===

function tryJsonParse(value: string): unknown {
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return value;
  try {
    const obj = JSON.parse(s);
    // 이중 JSON 문자열 처리
    if (typeof obj === 'string') {
      const s2 = obj.trim();
      if (s2.startsWith('{') || s2.startsWith('[')) {
        try {
          return JSON.parse(s2);
        } catch {
          return obj;
        }
      }
    }
    return obj;
  } catch {
    return value;
  }
}

function isComfyWorkflow(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.nodes)) return false;
  if (!Array.isArray(o.links) && !Array.isArray(o.edges)) return false;
  return true;
}

function isComfyPrompt(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const values = Object.values(obj);
  if (values.length === 0) return false;
  return values.some(v => 
    v && typeof v === 'object' && 
    'class_type' in (v as object) && 
    'inputs' in (v as object)
  );
}
