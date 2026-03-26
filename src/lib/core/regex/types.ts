/**
 * Risu Asset Extractor regex types
 */

/**
 * 정규식 적용 모드
 */
export type RegexMode = 
  | 'editinput'    // 사용자 입력 수정
  | 'editoutput'   // 캐릭터 출력 수정
  | 'editprocess'  // 요청 데이터 수정
  | 'editdisplay'; // 표시만 수정 (원본 불변)

/**
 * 정규식 스크립트 정의
 */
export interface RegexScript {
  /** 고유 ID */
  id?: string;
  
  /** 스크립트 이름 */
  comment?: string;
  
  /** 정규식 패턴 (IN) */
  in: string;
  
  /** 치환 문자열 (OUT) */
  out: string;
  
  /** 적용 모드 */
  type: RegexMode;
  
  /** 플래그 사용 여부 */
  ableFlag?: boolean;
  
  /** 정규식 플래그 (g, i, m, u, s, v 등) */
  flag?: string;
}

/**
 * 정규식 실행 결과
 */
export interface RegexResult {
  /** 처리된 텍스트 */
  output: string;
  
  /** 매치 정보 */
  matches: RegexMatchInfo[];
  
  /** 적용된 스크립트 수 */
  appliedCount: number;
  
  /** 에러 정보 */
  errors: RegexError[];
  
  /** 처리 시간 (ms) */
  duration: number;
}

/**
 * 개별 매치 정보
 */
export interface RegexMatchInfo {
  /** 스크립트 ID */
  scriptId?: string;
  
  /** 스크립트 이름 */
  scriptName?: string;
  
  /** 매치된 텍스트 */
  matched: string;
  
  /** 치환된 텍스트 */
  replacement: string;
  
  /** 매치 위치 */
  index: number;
  
  /** 캡처 그룹 */
  groups: string[];
  
  /** 명명된 그룹 */
  namedGroups?: Record<string, string>;
}

/**
 * 정규식 에러
 */
export interface RegexError {
  /** 에러 메시지 */
  message: string;
  
  /** 스크립트 ID */
  scriptId?: string;
  
  /** 패턴 */
  pattern?: string;
  
  /** 심각도 */
  severity: 'warning' | 'error';
}

/**
 * 디버그 단계 정보
 */
export interface RegexDebugStep {
  /** 단계 번호 */
  step: number;
  
  /** 스크립트 정보 */
  script: {
    id?: string;
    name?: string;
    pattern: string;
    replacement: string;
    flags: string;
  };
  
  /** 입력 텍스트 */
  input: string;
  
  /** 출력 텍스트 */
  output: string;
  
  /** 매치 여부 */
  matched: boolean;
  
  /** 매치 정보 */
  matches: RegexMatchInfo[];
  
  /** 에러 정보 */
  error?: RegexError;
  
  /** 실행 시간 (ms) */
  duration: number;
  
  /** 건너뜀 (모드 불일치) */
  skipped?: boolean;
  
  /** 건너뜀 이유 */
  skipReason?: string;
}

/**
 * 디버그 결과
 */
export interface RegexDebugResult {
  /** 원본 텍스트 */
  originalInput: string;
  
  /** 최종 출력 */
  finalOutput: string;
  
  /** 모든 단계 */
  steps: RegexDebugStep[];
  
  /** 총 처리 시간 */
  totalDuration: number;
  
  /** 적용된 스크립트 수 */
  appliedCount: number;
  
  /** 건너뛴 스크립트 수 */
  skippedCount: number;
  
  /** 에러 수 */
  errorCount: number;
}
