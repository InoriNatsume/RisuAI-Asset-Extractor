/**
 * Risu Asset Extractor trigger types
 * 
 * RisuAI 호환 트리거 시스템 타입 정의
 */

/**
 * 트리거 실행 시점
 */
export type TriggerType = 
  | 'start'    // 채팅 시작 시
  | 'manual'   // 수동 실행
  | 'output'   // AI 출력 후
  | 'input'    // 사용자 입력 후
  | 'display'  // 표시 시
  | 'request'; // 요청 전

/**
 * 트리거 스크립트 정의
 */
export interface TriggerScript {
  /** 고유 ID */
  id?: string;
  
  /** 설명/이름 */
  comment?: string;
  
  /** 실행 시점 */
  type: TriggerType;
  
  /** 실행 조건 */
  conditions: TriggerCondition[];
  
  /** 실행 효과 */
  effect: TriggerEffect[];
  
  /** 저수준 접근 허용 */
  lowLevelAccess?: boolean;
}

/**
 * 트리거 조건
 */
export type TriggerCondition = 
  | TriggerConditionVar
  | TriggerConditionExists
  | TriggerConditionChatIndex;

/**
 * 변수 조건
 */
export interface TriggerConditionVar {
  type: 'var' | 'value';
  var: string;
  value: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'null' | 'true';
}

/**
 * 존재 조건
 */
export interface TriggerConditionExists {
  type: 'exists';
  value: string;
  type2: 'strict' | 'loose' | 'regex';
  depth: number;
}

/**
 * 채팅 인덱스 조건
 */
export interface TriggerConditionChatIndex {
  type: 'chatindex';
  value: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'null' | 'true';
}

/**
 * 트리거 효과 (V1 + V2 통합)
 */
export type TriggerEffect = 
  | TriggerEffectSetVar
  | TriggerEffectCutChat
  | TriggerEffectModifyChat
  | TriggerEffectSystemPrompt
  | TriggerEffectImpersonate
  | TriggerEffectCommand
  | TriggerEffectStop
  | TriggerEffectRunTrigger
  | TriggerEffectShowAlert
  | TriggerEffectRegex
  | TriggerEffectLua
  | TriggerEffectV2Header
  | TriggerEffectV2If
  | TriggerEffectV2Else
  | TriggerEffectV2EndIndent
  | TriggerEffectV2Loop
  | TriggerEffectV2BreakLoop
  | TriggerEffectV2ConsoleLog;

/**
 * 변수 설정
 */
export interface TriggerEffectSetVar {
  type: 'setvar' | 'v2SetVar';
  operator: '=' | '+=' | '-=' | '*=' | '/=' | '%=';
  var: string;
  value: string;
  valueType?: 'var' | 'value';
  indent?: number;
}

/**
 * 채팅 잘라내기
 */
export interface TriggerEffectCutChat {
  type: 'cutchat' | 'v2CutChat';
  start: string;
  end: string;
  startType?: 'var' | 'value';
  endType?: 'var' | 'value';
  indent?: number;
}

/**
 * 채팅 수정
 */
export interface TriggerEffectModifyChat {
  type: 'modifychat' | 'v2ModifyChat';
  index: string;
  value: string;
  indexType?: 'var' | 'value';
  valueType?: 'var' | 'value';
  indent?: number;
}

/**
 * 시스템 프롬프트
 */
export interface TriggerEffectSystemPrompt {
  type: 'systemprompt' | 'v2SystemPrompt';
  location: 'start' | 'historyend' | 'promptend';
  value: string;
  valueType?: 'var' | 'value';
  indent?: number;
}

/**
 * 가장
 */
export interface TriggerEffectImpersonate {
  type: 'impersonate' | 'v2Impersonate';
  role: 'user' | 'char';
  value: string;
  valueType?: 'var' | 'value';
  indent?: number;
}

/**
 * 명령 실행
 */
export interface TriggerEffectCommand {
  type: 'command' | 'v2Command';
  value: string;
  valueType?: 'var' | 'value';
  indent?: number;
}

/**
 * 중단
 */
export interface TriggerEffectStop {
  type: 'stop' | 'v2StopTrigger';
  indent?: number;
}

/**
 * 다른 트리거 실행
 */
export interface TriggerEffectRunTrigger {
  type: 'runtrigger' | 'v2RunTrigger';
  value?: string;
  target?: string;
  indent?: number;
}

/**
 * 알림 표시
 */
export interface TriggerEffectShowAlert {
  type: 'showAlert' | 'v2ShowAlert';
  alertType: string;
  value: string;
  inputVar?: string;
  indent?: number;
}

/**
 * 정규식 추출
 */
export interface TriggerEffectRegex {
  type: 'extractRegex' | 'v2ExtractRegex';
  value: string;
  regex: string;
  flags: string;
  result: string;
  inputVar?: string;
  indent?: number;
}

/**
 * Lua 코드 실행
 */
export interface TriggerEffectLua {
  type: 'triggercode' | 'triggerlua';
  code: string;
}

/**
 * V2 헤더
 */
export interface TriggerEffectV2Header {
  type: 'v2Header';
  code?: string;
  indent: number;
}

/**
 * V2 조건문
 */
export interface TriggerEffectV2If {
  type: 'v2If';
  condition: '=' | '!=' | '>' | '<' | '>=' | '<=';
  targetType: 'var' | 'value';
  target: string;
  source: string;
  indent: number;
}

/**
 * V2 else
 */
export interface TriggerEffectV2Else {
  type: 'v2Else';
  indent: number;
}

/**
 * V2 블록 종료
 */
export interface TriggerEffectV2EndIndent {
  type: 'v2EndIndent';
  endOfLoop?: boolean;
  indent: number;
}

/**
 * V2 반복
 */
export interface TriggerEffectV2Loop {
  type: 'v2Loop' | 'v2LoopNTimes';
  value?: string;
  valueType?: 'var' | 'value';
  indent: number;
}

/**
 * V2 반복 중단
 */
export interface TriggerEffectV2BreakLoop {
  type: 'v2BreakLoop';
  indent: number;
}

/**
 * V2 콘솔 로그
 */
export interface TriggerEffectV2ConsoleLog {
  type: 'v2ConsoleLog';
  sourceType: 'var' | 'value';
  source: string;
  indent: number;
}

/**
 * 트리거 실행 컨텍스트
 */
export interface TriggerContext {
  /** 채팅 변수 */
  chatVars: Record<string, string>;
  
  /** 글로벌 변수 */
  globalVars: Record<string, string>;
  
  /** 임시 변수 */
  tempVars: Record<string, string>;
  
  /** 채팅 히스토리 */
  chat: Array<{
    role: 'user' | 'char' | 'system';
    content: string;
  }>;
  
  /** 현재 메시지 인덱스 */
  chatIndex: number;
  
  /** 시스템 프롬프트 */
  systemPrompts: {
    start: string;
    historyend: string;
    promptend: string;
  };
  
  /** 중단 플래그 */
  stopped: boolean;
}

/**
 * 트리거 실행 결과
 */
export interface TriggerResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 수정된 컨텍스트 */
  context: TriggerContext;
  
  /** 실행된 효과 수 */
  effectsExecuted: number;
  
  /** 에러 목록 */
  errors: TriggerError[];
  
  /** 로그 */
  logs: string[];
  
  /** 실행 시간 (ms) */
  duration: number;
}

/**
 * 트리거 에러
 */
export interface TriggerError {
  message: string;
  effectType?: string;
  index?: number;
  severity: 'warning' | 'error';
}

/**
 * 디버그 단계
 */
export interface TriggerDebugStep {
  /** 단계 번호 */
  step: number;
  
  /** 효과 정보 */
  effect: TriggerEffect;
  
  /** 실행 전 컨텍스트 스냅샷 */
  beforeContext: TriggerContext;
  
  /** 실행 후 컨텍스트 스냅샷 */
  afterContext: TriggerContext;
  
  /** 건너뜀 여부 */
  skipped: boolean;
  
  /** 건너뜀 이유 */
  skipReason?: string;
  
  /** 에러 */
  error?: TriggerError;
  
  /** 로그 출력 */
  logs: string[];
  
  /** 실행 시간 */
  duration: number;
}
