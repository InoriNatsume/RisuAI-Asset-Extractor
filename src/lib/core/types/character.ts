/**
 * Character Card Types
 * CCv2/CCv3 캐릭터 카드 인터페이스
 * 
 * 참조: RisuAI_Format_Specification.md
 */

/**
 * CCv3 캐릭터 카드 (최신)
 */
export interface CharacterCardV3 {
  spec: 'chara_card_v3';
  spec_version: string;
  data: CharacterCardV3Data;
}

export interface CharacterCardV3Data {
  name: string;
  description: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  mes_example?: string;
  extensions?: CharacterExtensions;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  alternate_greetings?: string[];
  system_prompt?: string;
  post_history_instructions?: string;
  creator_notes?: string;
  character_book?: CharacterBook;
  assets?: CharacterAsset[];
  nickname?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings?: GroupOnlyGreeting[];
  creation_date?: number;
}

export interface CharacterExtensions {
  risuai?: RisuAIExtension;
  [key: string]: unknown;
}

export interface RisuAIExtension {
  emotions?: [string, string][];
  additionalAssets?: [string, string, string?][];
  triggerscript?: TriggerScript[];
  customScripts?: CustomScript[];
  additionalData?: RisuAdditionalData;
  license?: string;
}

export interface RisuAdditionalData {
  virtualscript?: string;
  extAssets?: [string, string, string?][];
  private?: boolean;
  depth_prompt?: DepthPrompt;
  globalLore?: LoreBookEntry[];
  [key: string]: unknown;
}

export interface DepthPrompt {
  prompt: string;
  depth: number;
  role: 'system' | 'user' | 'assistant';
}

/**
 * CCv2 캐릭터 카드 (레거시)
 */
export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: string;
  data: CharacterCardV2Data;
}

export interface CharacterCardV2Data {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  character_book?: CharacterBook;
  tags?: string[];
  creator?: string;
  character_version?: string;
  extensions?: CharacterExtensions;
}

/**
 * 캐릭터북 (로어북)
 */
export interface CharacterBook {
  entries: LoreBookEntry[];
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions?: Record<string, unknown>;
}

export interface LoreBookEntry {
  keys: string[];
  content: string;
  extensions?: Record<string, unknown>;
  enabled: boolean;
  insertion_order: number;
  case_sensitive?: boolean;
  name?: string;
  priority?: number;
  id?: number;
  comment?: string;
  selective?: boolean;
  secondary_keys?: string[];
  constant?: boolean;
  position?: 'before_char' | 'after_char';
}

/**
 * CCv3 에셋
 */
export interface CharacterAsset {
  type: string;
  uri: string;
  name: string;
  ext: string;
}

/**
 * 그룹 전용 인사말
 */
export interface GroupOnlyGreeting {
  message: string;
  characters: string[];
}

/**
 * 트리거 스크립트 (V2)
 */
export interface TriggerScript {
  comment?: string;
  type: TriggerType;
  conditions?: TriggerCondition[];
  effect?: TriggerEffect[];
  id?: string;
  lowLevelAccess?: boolean;
}

export type TriggerType = 
  | 'start' | 'input' | 'output' | 'manual'
  | 'editinput' | 'editoutput' | 'editprocess' | 'editdisplay'
  | 'chat_complete' | 'input_sent' | 'output_received';

export interface TriggerCondition {
  type: ConditionType;
  value?: unknown;
  [key: string]: unknown;
}

export type ConditionType = 
  | 'var' | 'not_var' | 'equal' | 'not_equal'
  | 'greater' | 'less' | 'contains' | 'not_contains'
  | 'exists' | 'not_exists' | 'always' | 'never';

export interface TriggerEffect {
  type: EffectType;
  value?: unknown;
  [key: string]: unknown;
}

export type EffectType = 
  | 'setvar' | 'addvar' | 'subvar' | 'mulvar' | 'divvar'
  | 'goto' | 'break' | 'continue' | 'return'
  | 'say' | 'sendas' | 'input' | 'output'
  | 'runlua' | 'runjs' | 'runcbs';

/**
 * 커스텀 스크립트 (Regex)
 */
export interface CustomScript {
  comment?: string;
  in: string;
  out: string;
  type: ScriptType;
  flag?: string;
  id?: string;
}

export type ScriptType = 
  | 'editinput' | 'editoutput' | 'editprocess' | 'editdisplay'
  | 'disabled';

/**
 * 통합 캐릭터 카드 타입
 */
export type CharacterCard = CharacterCardV3 | CharacterCardV2;

/**
 * 캐릭터 카드인지 확인
 */
export function isCharacterCardV3(card: CharacterCard): card is CharacterCardV3 {
  return card.spec === 'chara_card_v3';
}

export function isCharacterCardV2(card: CharacterCard): card is CharacterCardV2 {
  return card.spec === 'chara_card_v2';
}
