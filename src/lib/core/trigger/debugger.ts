/**
 * Risu Asset Extractor trigger debugger
 * 
 * 트리거 스크립트 단계별 디버깅
 */

import type {
  TriggerScript,
  TriggerType,
  TriggerEffect,
  TriggerContext,
  TriggerDebugStep,
  TriggerError,
} from './types';
import { TriggerEngine } from './engine';

/**
 * 트리거 디버거 클래스
 */
export class TriggerDebugger {
  private engine: TriggerEngine;
  private script: TriggerScript | null = null;
  private context: TriggerContext;
  private currentStep: number = 0;
  private steps: TriggerDebugStep[] = [];
  private logs: string[] = [];
  
  constructor() {
    this.engine = new TriggerEngine();
    this.context = this.engine.createContext();
  }
  
  /**
   * 디버깅할 스크립트 설정
   */
  setScript(script: TriggerScript): void {
    this.script = script;
    this.engine.setScripts([script]);
  }
  
  /**
   * 컨텍스트 설정
   */
  setContext(context: Partial<TriggerContext>): void {
    this.context = {
      ...this.engine.createContext(),
      ...context,
    };
  }
  
  /**
   * 디버깅 초기화
   */
  init(): void {
    this.currentStep = 0;
    this.steps = [];
    this.logs = [];
    this.context.stopped = false;
  }
  
  /**
   * 전체 실행 (디버그 정보 포함)
   */
  runAll(): TriggerDebugStep[] {
    this.init();
    
    if (!this.script) {
      return [];
    }
    
    while (this.currentStep < this.script.effect.length && !this.context.stopped) {
      this.stepForward();
    }
    
    return this.steps;
  }
  
  /**
   * 한 단계 실행
   */
  stepForward(): TriggerDebugStep | null {
    if (!this.script || this.currentStep >= this.script.effect.length) {
      return null;
    }
    
    if (this.context.stopped) {
      return null;
    }
    
    const effect = this.script.effect[this.currentStep];
    const startTime = performance.now();
    
    // 실행 전 컨텍스트 스냅샷
    const beforeContext = this.cloneContext(this.context);
    
    const step: TriggerDebugStep = {
      step: this.currentStep + 1,
      effect,
      beforeContext,
      afterContext: beforeContext,
      skipped: false,
      logs: [],
      duration: 0,
    };
    
    try {
      // 효과 실행
      this.executeEffectDebug(effect, this.context, step);
      
      // 실행 후 컨텍스트 스냅샷
      step.afterContext = this.cloneContext(this.context);
    } catch (error) {
      step.error = {
        message: error instanceof Error ? error.message : String(error),
        effectType: effect.type,
        severity: 'error',
      };
    }
    
    step.duration = performance.now() - startTime;
    this.steps.push(step);
    this.currentStep++;
    
    return step;
  }
  
  /**
   * 효과 실행 (디버그 모드)
   */
  private executeEffectDebug(
    effect: TriggerEffect,
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    switch (effect.type) {
      case 'setvar':
      case 'v2SetVar':
        this.executeSetVar(effect as any, ctx, step);
        break;
        
      case 'stop':
      case 'v2StopTrigger':
        ctx.stopped = true;
        step.logs.push('트리거 중단됨');
        break;
        
      case 'v2ConsoleLog':
        this.executeConsoleLog(effect as any, ctx, step);
        break;
        
      case 'cutchat':
      case 'v2CutChat':
        this.executeCutChat(effect as any, ctx, step);
        break;
        
      case 'modifychat':
      case 'v2ModifyChat':
        this.executeModifyChat(effect as any, ctx, step);
        break;
        
      case 'systemprompt':
      case 'v2SystemPrompt':
        this.executeSystemPrompt(effect as any, ctx, step);
        break;
        
      case 'impersonate':
      case 'v2Impersonate':
        this.executeImpersonate(effect as any, ctx, step);
        break;
        
      case 'triggercode':
      case 'triggerlua':
        step.logs.push(`[Lua 코드 - 시뮬레이터에서 미지원]`);
        step.logs.push((effect as any).code?.slice(0, 100) + '...');
        break;
        
      case 'v2If':
        this.executeIf(effect as any, ctx, step);
        break;
        
      case 'v2Else':
        step.logs.push('else 블록');
        break;
        
      case 'v2EndIndent':
        step.logs.push('블록 종료');
        break;
        
      case 'v2Loop':
      case 'v2LoopNTimes':
        step.logs.push('루프 시작');
        break;
        
      case 'v2BreakLoop':
        step.logs.push('루프 중단');
        break;
        
      default:
        step.logs.push(`[미지원 효과: ${effect.type}]`);
    }
  }
  
  /**
   * 변수 설정
   */
  private executeSetVar(
    effect: { var: string; value: string; operator: string; valueType?: string },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    const oldValue = ctx.chatVars[effect.var] ?? '';
    
    switch (effect.operator) {
      case '=':
        ctx.chatVars[effect.var] = value;
        break;
      case '+=':
        ctx.chatVars[effect.var] = (Number(oldValue) + Number(value)).toString();
        break;
      case '-=':
        ctx.chatVars[effect.var] = (Number(oldValue) - Number(value)).toString();
        break;
      case '*=':
        ctx.chatVars[effect.var] = (Number(oldValue) * Number(value)).toString();
        break;
      case '/=':
        ctx.chatVars[effect.var] = (Number(oldValue) / Number(value)).toString();
        break;
      case '%=':
        ctx.chatVars[effect.var] = (Number(oldValue) % Number(value)).toString();
        break;
    }
    
    const newValue = ctx.chatVars[effect.var];
    step.logs.push(`${effect.var}: "${oldValue}" ${effect.operator} "${value}" → "${newValue}"`);
  }
  
  /**
   * 콘솔 로그
   */
  private executeConsoleLog(
    effect: { source: string; sourceType: 'var' | 'value' },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const value = effect.sourceType === 'var'
      ? (ctx.chatVars[effect.source] ?? '')
      : effect.source;
    
    step.logs.push(`[log] ${value}`);
    this.logs.push(value);
  }
  
  /**
   * 채팅 잘라내기
   */
  private executeCutChat(
    effect: { start: string; end: string; startType?: string; endType?: string },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const start = effect.startType === 'var'
      ? Number(ctx.chatVars[effect.start] ?? 0)
      : Number(effect.start);
    
    const end = effect.endType === 'var'
      ? Number(ctx.chatVars[effect.end] ?? ctx.chat.length)
      : Number(effect.end);
    
    const beforeCount = ctx.chat.length;
    ctx.chat = ctx.chat.slice(start, end);
    
    step.logs.push(`채팅 잘라내기: [${start}:${end}], ${beforeCount}개 → ${ctx.chat.length}개`);
  }
  
  /**
   * 채팅 수정
   */
  private executeModifyChat(
    effect: { index: string; value: string; indexType?: string; valueType?: string },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const index = effect.indexType === 'var'
      ? Number(ctx.chatVars[effect.index] ?? 0)
      : Number(effect.index);
    
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    if (index >= 0 && index < ctx.chat.length) {
      const oldContent = ctx.chat[index].content;
      ctx.chat[index].content = value;
      step.logs.push(`채팅[${index}] 수정: "${oldContent.slice(0, 30)}..." → "${value.slice(0, 30)}..."`);
    } else {
      step.logs.push(`채팅[${index}] 수정 실패: 범위 초과`);
    }
  }
  
  /**
   * 시스템 프롬프트
   */
  private executeSystemPrompt(
    effect: { location: 'start' | 'historyend' | 'promptend'; value: string; valueType?: string },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    ctx.systemPrompts[effect.location] = value;
    step.logs.push(`시스템 프롬프트[${effect.location}] 설정: "${value.slice(0, 50)}..."`);
  }
  
  /**
   * 가장
   */
  private executeImpersonate(
    effect: { role: 'user' | 'char'; value: string; valueType?: string },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    ctx.chat.push({
      role: effect.role,
      content: value,
    });
    
    step.logs.push(`가장[${effect.role}]: "${value.slice(0, 50)}..."`);
  }
  
  /**
   * 조건문
   */
  private executeIf(
    effect: { condition: string; target: string; source: string; targetType: string },
    ctx: TriggerContext,
    step: TriggerDebugStep
  ): void {
    const targetValue = effect.targetType === 'var'
      ? (ctx.chatVars[effect.target] ?? '')
      : effect.target;
    
    const sourceValue = ctx.chatVars[effect.source] ?? effect.source;
    
    let result = false;
    switch (effect.condition) {
      case '=':
        result = targetValue === sourceValue;
        break;
      case '!=':
        result = targetValue !== sourceValue;
        break;
      case '>':
        result = Number(targetValue) > Number(sourceValue);
        break;
      case '<':
        result = Number(targetValue) < Number(sourceValue);
        break;
      case '>=':
        result = Number(targetValue) >= Number(sourceValue);
        break;
      case '<=':
        result = Number(targetValue) <= Number(sourceValue);
        break;
    }
    
    step.logs.push(`if(${effect.target} ${effect.condition} ${effect.source}): ${result ? 'true' : 'false'}`);
  }
  
  /**
   * 컨텍스트 복제
   */
  private cloneContext(ctx: TriggerContext): TriggerContext {
    return {
      chatVars: { ...ctx.chatVars },
      globalVars: { ...ctx.globalVars },
      tempVars: { ...ctx.tempVars },
      chat: ctx.chat.map(m => ({ ...m })),
      chatIndex: ctx.chatIndex,
      systemPrompts: { ...ctx.systemPrompts },
      stopped: ctx.stopped,
    };
  }
  
  /**
   * 현재 상태 조회
   */
  getCurrentState(): {
    step: number;
    total: number;
    context: TriggerContext;
    isComplete: boolean;
    isStopped: boolean;
  } {
    return {
      step: this.currentStep,
      total: this.script?.effect.length ?? 0,
      context: this.context,
      isComplete: this.currentStep >= (this.script?.effect.length ?? 0),
      isStopped: this.context.stopped,
    };
  }
  
  /**
   * 단계 조회
   */
  getSteps(): TriggerDebugStep[] {
    return [...this.steps];
  }
  
  /**
   * 로그 조회
   */
  getLogs(): string[] {
    return [...this.logs];
  }
  
  /**
   * 리셋
   */
  reset(): void {
    this.currentStep = 0;
    this.steps = [];
    this.logs = [];
    this.context = this.engine.createContext();
  }
}
