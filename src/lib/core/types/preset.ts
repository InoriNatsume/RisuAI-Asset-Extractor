/**
 * RisuAI Preset Types
 * .risup/.risupreset 프리셋 인터페이스
 * 
 * 참조: RisuAI_Format_Specification.md, risup_cherrypick.md
 */

/**
 * RisuAI 프리셋
 */
export interface RisuPreset {
  // 기본 정보
  name: string;
  id?: string;
  
  // 프롬프트 설정
  promptTemplate?: PromptItem[];
  systemPrompt?: string;
  jailbreak?: string;
  authorNote?: string;
  formatingOrder?: string[];
  
  // 모델 설정
  aiModel?: string;
  subModel?: string;
  maxContext?: number;
  maxResponse?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  
  // Regex
  customScripts?: PresetRegex[];
  
  // 기타
  bias?: BiasEntry[];
  memoryEncoder?: string;
  autoSuggestPrompt?: string;
  
  // 버전 정보
  presetVersion?: number;
  
  // NAI 호환
  naiApiUrl?: string;
  naiProxy?: string;
  naiSettings?: NAISettings;
  
  // 확장
  [key: string]: unknown;
}

/**
 * 프롬프트 템플릿 항목
 */
export interface PromptItem {
  type: PromptItemType;
  text?: string;
  role?: 'system' | 'user' | 'assistant';
  position?: 'start' | 'end';
  depth?: number;
  [key: string]: unknown;
}

export type PromptItemType = 
  | 'plain' | 'jailbreak' | 'cot'
  | 'description' | 'personality' | 'scenario'
  | 'persona' | 'main' | 'lorebook'
  | 'posthistory' | 'authornote' | 'chat'
  | 'memory' | 'couple' | 'custom';

/**
 * 프리셋 정규식
 */
export interface PresetRegex {
  comment?: string;
  in: string;
  out: string;
  type: PresetRegexType;
  flag?: string;
}

export type PresetRegexType = 
  | 'editinput' | 'editoutput' | 'editprocess' | 'editdisplay'
  | 'disabled';

/**
 * 바이어스 엔트리
 */
export interface BiasEntry {
  text: string;
  bias: number;
}

/**
 * NAI 설정
 */
export interface NAISettings {
  model?: string;
  min_length?: number;
  max_length?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tail_free_sampling?: number;
  repetition_penalty?: number;
  repetition_penalty_range?: number;
  repetition_penalty_slope?: number;
  repetition_penalty_frequency?: number;
  repetition_penalty_presence?: number;
  [key: string]: unknown;
}

/**
 * risup 파일 구조
 */
export interface RisupFile {
  preset: RisuPreset;
  raw?: Uint8Array;
}

/**
 * 프리셋 메타데이터
 */
export interface PresetMetadata {
  source?: 'file' | 'import';
  fileName?: string;
  originalFormat?: 'risup' | 'risupreset' | 'nai' | 'st' | 'json';
  lastModified?: number;
}

/**
 * 프리셋 + 메타데이터 번들
 */
export interface PresetBundle {
  preset: RisuPreset;
  metadata: PresetMetadata;
}

/**
 * 빈 프리셋 생성
 */
export function createEmptyPreset(overrides?: Partial<RisuPreset>): RisuPreset {
  return {
    name: '새 프리셋',
    id: crypto.randomUUID(),
    promptTemplate: [],
    customScripts: [],
    maxContext: 8192,
    maxResponse: 512,
    temperature: 0.7,
    presetVersion: 1,
    ...overrides
  };
}

/**
 * NAI 프리셋인지 확인 (presetVersion >= 3)
 */
export function isNAIPreset(preset: unknown): boolean {
  if (!preset || typeof preset !== 'object') return false;
  const p = preset as Record<string, unknown>;
  return typeof p.presetVersion === 'number' && p.presetVersion >= 3;
}

/**
 * ST 프리셋인지 확인 (prompt_order 배열 존재)
 */
export function isSTPreset(preset: unknown): boolean {
  if (!preset || typeof preset !== 'object') return false;
  const p = preset as Record<string, unknown>;
  return Array.isArray(p.prompt_order);
}
