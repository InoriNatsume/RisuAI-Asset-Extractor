/**
 * RisuAI Module Types
 * .risum 모듈 인터페이스
 * 
 * 참조: RisuAI_Format_Specification.md
 */

import type { LoreBookEntry, TriggerScript, CustomScript } from './character';

/**
 * RisuAI 모듈 (risum)
 */
export interface RisuModule {
  // 시스템 필드
  id: string;
  addedTime: number;
  
  // 필수 필드
  name: string;
  description: string;
  
  // 선택적 필드
  namespace?: string;
  hideIcon?: boolean;
  customModuleToggle?: string;
  backgroundEmbedding?: string;
  cjs?: string;
  mcp?: MCPConfig;
  lowLevelAccess?: boolean;
  
  // 배열 필드
  lorebook: ModuleLoreBookEntry[];
  regex: ModuleRegex[];
  trigger: ModuleTrigger[];
  assets: ModuleAsset[];
  
  // 런타임 필드 (저장 안됨)
  enabled?: boolean;
  displayOrder?: number;
}

/**
 * 모듈 로어북 엔트리
 */
export interface ModuleLoreBookEntry extends LoreBookEntry {
  _id?: string;
  key?: string;
  mode?: 'normal' | 'folder';
  folder?: string;
  alwaysActive?: boolean;
}

/**
 * 모듈 정규식
 */
export interface ModuleRegex extends CustomScript {
  _id?: string;
}

/**
 * 모듈 트리거
 */
export interface ModuleTrigger extends TriggerScript {
  _id?: string;
}

/**
 * 모듈 에셋 [id, uri, ext]
 */
export type ModuleAsset = [string, string, string];

/**
 * MCP 설정
 */
export interface MCPConfig {
  enabled?: boolean;
  server?: string;
  tools?: string[];
  [key: string]: unknown;
}

/**
 * risum 파일 구조
 */
export interface RisumFile {
  magic: Uint8Array;
  version: number;
  module: RisuModule;
  assets: Map<string, Uint8Array>;
}

/**
 * 모듈 메타데이터 (에디터용)
 */
export interface ModuleMetadata {
  source?: 'file' | 'hub';
  fileName?: string;
  lastModified?: number;
  fileSize?: number;
}

/**
 * 모듈 + 메타데이터 번들
 */
export interface ModuleBundle {
  module: RisuModule;
  metadata: ModuleMetadata;
  assets: Map<string, Uint8Array>;
}

/**
 * 빈 모듈 생성
 */
export function createEmptyModule(overrides?: Partial<RisuModule>): RisuModule {
  return {
    id: crypto.randomUUID(),
    addedTime: Date.now(),
    name: '새 모듈',
    description: '',
    lorebook: [],
    regex: [],
    trigger: [],
    assets: [],
    ...overrides
  };
}

/**
 * UUID 생성
 */
export function generateModuleId(): string {
  return crypto.randomUUID();
}
