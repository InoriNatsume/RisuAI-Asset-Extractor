/**
 * EXIF 관련 타입 정의
 */

/** AI 모델 종류 */
export type AIModelKind = 'nai' | 'comfy' | 'a1111' | 'unknown';

/** 모델 탐지 결과 */
export interface ModelDetectionResult {
  kind: AIModelKind;
  reason: string;
}

/** PNG 텍스트 청크 결과 (키 중복 허용) */
export interface PngTextChunks {
  [key: string]: string[];
}

/** 스텔스 EXIF 비트 추출 결과 */
export interface StealthBitsResult {
  mode: 'alpha' | 'rgb';
  compressed: boolean;
  binaryData: string;
}

/** NAI 정규화된 메타데이터 */
export interface NAINormalizedMeta {
  /** 긍정 프롬프트 */
  positive: string;
  /** 부정 프롬프트 */
  negative: string;
  /** V4 포맷 여부 */
  isV4: boolean;
  /** 캐릭터별 프롬프트 */
  charPrompts: CharPrompt[];
  
  /** 스텝 수 */
  steps?: number;
  /** CFG 스케일 */
  scale?: number;
  /** 샘플러 이름 */
  sampler?: string;
  /** 시드 */
  seed?: number | string;
  
  /** 이미지 너비 */
  width?: number;
  /** 이미지 높이 */
  height?: number;
  
  /** 모델 이름 */
  model?: string;
  /** 소프트웨어 */
  software?: string;
  
  /** 노이즈 스케줄 */
  noiseSchedule?: string;
  /** SMEA 사용 */
  smea?: boolean;
  /** SMEA Dynamic */
  smeaDyn?: boolean;
  
  /** UC 프리셋 */
  ucPreset?: number;
  /** 품질 태그 사용 */
  qualityTags?: boolean;
  /** 캐릭터 프롬프트 모드 */
  characterPromptMode?: string;
  
  /** 레퍼런스 이미지 */
  referenceImages?: string[];
  
  /** 추가 데이터 */
  extras: Record<string, unknown>;
  /** 원본 데이터 */
  raw: unknown;
}

/** 캐릭터 프롬프트 */
export interface CharPrompt {
  /** 캐릭터 이름 */
  name: string;
  /** 캐릭터 캡션/프롬프트 */
  caption: string;
  /** 중심 좌표 */
  center?: { x: number; y: number };
  /** 위치 영역 */
  position?: { x: number; y: number; w: number; h: number };
}

/** ComfyUI 노드 정보 */
export interface ComfyNode {
  id: number;
  type: string;
  title?: string;
  inputs?: unknown[];
  outputs?: unknown[];
  properties?: Record<string, unknown>;
  widgets_values?: unknown[];
  pos?: [number, number];
  size?: [number, number];
}

/** ComfyUI 워크플로우 */
export interface ComfyWorkflow {
  nodes: ComfyNode[];
  edges: ComfyEdge[];
  version?: number;
  lastNodeId?: number;
  lastLinkId?: number;
  groups?: unknown[];
}

/** ComfyUI 엣지 (노드 연결) */
export interface ComfyEdge {
  id: number;
  sourceNodeId: number;
  sourceSlot: number;
  targetNodeId: number;
  targetSlot: number;
  type?: string;
}

/** 통합 메타데이터 추출 결과 */
export interface ExtractedMetadata {
  pngText: PngTextChunks;
  stealthExif: unknown | null;
  standardExif: unknown | null;
  modelKind: AIModelKind;
  modelReason: string;
  normalized: NAINormalizedMeta | import('./schema/comfyui').ComfyNormalizedMeta | null;
}
