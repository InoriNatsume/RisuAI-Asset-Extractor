/**
 * Risu Asset Extractor trigger engine
 * 
 * 트리거 스크립트 실행 엔진
 */

import type {
  TriggerScript,
  TriggerType,
  TriggerCondition,
  TriggerEffect,
  TriggerContext,
  TriggerResult,
  TriggerError,
} from './types';

/**
 * 트리거 엔진 클래스
 */
export class TriggerEngine {
  private scripts: TriggerScript[] = [];
  private logs: string[] = [];
  
  /**
   * 스크립트 설정
   */
  setScripts(scripts: TriggerScript[]): void {
    this.scripts = scripts;
  }
  
  /**
   * 스크립트 추가
   */
  addScript(script: TriggerScript): void {
    this.scripts.push(script);
  }
  
  /**
   * 기본 컨텍스트 생성
   */
  createContext(): TriggerContext {
    return {
      chatVars: {},
      globalVars: {},
      tempVars: {},
      chat: [],
      chatIndex: -1,
      systemPrompts: {
        start: '',
        historyend: '',
        promptend: '',
      },
      stopped: false,
    };
  }
  
  /**
   * 특정 타입의 트리거 실행
   */
  run(type: TriggerType, context: TriggerContext): TriggerResult {
    const startTime = performance.now();
    this.logs = [];
    const errors: TriggerError[] = [];
    let effectsExecuted = 0;
    
    // 해당 타입의 스크립트 필터링
    const matchingScripts = this.scripts.filter(s => s.type === type);
    
    for (const script of matchingScripts) {
      // 조건 확인
      if (!this.checkConditions(script.conditions, context)) {
        continue;
      }
      
      // 효과 실행
      for (const effect of script.effect) {
        if (context.stopped) {
          break;
        }
        
        try {
          this.executeEffect(effect, context);
          effectsExecuted++;
        } catch (error) {
          errors.push({
            message: error instanceof Error ? error.message : String(error),
            effectType: effect.type,
            severity: 'error',
          });
        }
      }
      
      if (context.stopped) {
        break;
      }
    }
    
    return {
      success: errors.length === 0,
      context,
      effectsExecuted,
      errors,
      logs: this.logs,
      duration: performance.now() - startTime,
    };
  }
  
  /**
   * 조건 확인
   */
  private checkConditions(conditions: TriggerCondition[], ctx: TriggerContext): boolean {
    if (conditions.length === 0) {
      return true;
    }
    
    for (const condition of conditions) {
      if (!this.checkCondition(condition, ctx)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * 단일 조건 확인
   */
  private checkCondition(condition: TriggerCondition, ctx: TriggerContext): boolean {
    switch (condition.type) {
      case 'var':
      case 'value': {
        const varValue = ctx.chatVars[condition.var] ?? '';
        return this.compareValues(varValue, condition.value, condition.operator);
      }
      
      case 'chatindex': {
        return this.compareValues(
          ctx.chatIndex.toString(),
          condition.value,
          condition.operator
        );
      }
      
      case 'exists': {
        const searchText = condition.value;
        const depth = condition.depth || 10;
        const recentChat = ctx.chat.slice(-depth);
        
        switch (condition.type2) {
          case 'strict':
            return recentChat.some(m => m.content === searchText);
          case 'loose':
            return recentChat.some(m => m.content.includes(searchText));
          case 'regex':
            try {
              const regex = new RegExp(searchText);
              return recentChat.some(m => regex.test(m.content));
            } catch {
              return false;
            }
          default:
            return false;
        }
      }
      
      default:
        return true;
    }
  }
  
  /**
   * 값 비교
   */
  private compareValues(a: string, b: string, operator: string): boolean {
    switch (operator) {
      case '=':
        return a === b;
      case '!=':
        return a !== b;
      case '>':
        return Number(a) > Number(b);
      case '<':
        return Number(a) < Number(b);
      case '>=':
        return Number(a) >= Number(b);
      case '<=':
        return Number(a) <= Number(b);
      case 'null':
        return a === '' || a === null || a === undefined;
      case 'true':
        return a === '1' || a === 'true';
      default:
        return false;
    }
  }
  
  /**
   * 효과 실행
   */
  private executeEffect(effect: TriggerEffect, ctx: TriggerContext): void {
    switch (effect.type) {
      case 'setvar':
      case 'v2SetVar':
        this.executeSetVar(effect as any, ctx);
        break;
        
      case 'cutchat':
      case 'v2CutChat':
        this.executeCutChat(effect as any, ctx);
        break;
        
      case 'modifychat':
      case 'v2ModifyChat':
        this.executeModifyChat(effect as any, ctx);
        break;
        
      case 'systemprompt':
      case 'v2SystemPrompt':
        this.executeSystemPrompt(effect as any, ctx);
        break;
        
      case 'impersonate':
      case 'v2Impersonate':
        this.executeImpersonate(effect as any, ctx);
        break;
        
      case 'stop':
      case 'v2StopTrigger':
        ctx.stopped = true;
        break;
        
      case 'v2ConsoleLog':
        this.executeConsoleLog(effect as any, ctx);
        break;
        
      case 'triggercode':
      case 'triggerlua':
        // Lua 코드는 시뮬레이터에서 제한적 지원
        this.logs.push(`[Lua] ${(effect as any).code?.slice(0, 50)}...`);
        break;
        
      default:
        // 지원하지 않는 효과는 로그만 남김
        this.logs.push(`[미지원] ${effect.type}`);
    }
  }
  
  /**
   * 변수 설정 효과
   */
  private executeSetVar(
    effect: { var: string; value: string; operator: string; valueType?: string },
    ctx: TriggerContext
  ): void {
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    const currentValue = ctx.chatVars[effect.var] ?? '';
    
    switch (effect.operator) {
      case '=':
        ctx.chatVars[effect.var] = value;
        break;
      case '+=':
        ctx.chatVars[effect.var] = (Number(currentValue) + Number(value)).toString();
        break;
      case '-=':
        ctx.chatVars[effect.var] = (Number(currentValue) - Number(value)).toString();
        break;
      case '*=':
        ctx.chatVars[effect.var] = (Number(currentValue) * Number(value)).toString();
        break;
      case '/=':
        ctx.chatVars[effect.var] = (Number(currentValue) / Number(value)).toString();
        break;
      case '%=':
        ctx.chatVars[effect.var] = (Number(currentValue) % Number(value)).toString();
        break;
    }
  }
  
  /**
   * 채팅 잘라내기 효과
   */
  private executeCutChat(
    effect: { start: string; end: string; startType?: string; endType?: string },
    ctx: TriggerContext
  ): void {
    const start = effect.startType === 'var'
      ? Number(ctx.chatVars[effect.start] ?? 0)
      : Number(effect.start);
    
    const end = effect.endType === 'var'
      ? Number(ctx.chatVars[effect.end] ?? ctx.chat.length)
      : Number(effect.end);
    
    ctx.chat = ctx.chat.slice(start, end);
  }
  
  /**
   * 채팅 수정 효과
   */
  private executeModifyChat(
    effect: { index: string; value: string; indexType?: string; valueType?: string },
    ctx: TriggerContext
  ): void {
    const index = effect.indexType === 'var'
      ? Number(ctx.chatVars[effect.index] ?? 0)
      : Number(effect.index);
    
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    if (index >= 0 && index < ctx.chat.length) {
      ctx.chat[index].content = value;
    }
  }
  
  /**
   * 시스템 프롬프트 효과
   */
  private executeSystemPrompt(
    effect: { location: 'start' | 'historyend' | 'promptend'; value: string; valueType?: string },
    ctx: TriggerContext
  ): void {
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    ctx.systemPrompts[effect.location] = value;
  }
  
  /**
   * 가장 효과
   */
  private executeImpersonate(
    effect: { role: 'user' | 'char'; value: string; valueType?: string },
    ctx: TriggerContext
  ): void {
    const value = effect.valueType === 'var'
      ? (ctx.chatVars[effect.value] ?? '')
      : effect.value;
    
    ctx.chat.push({
      role: effect.role,
      content: value,
    });
  }
  
  /**
   * 콘솔 로그 효과
   */
  private executeConsoleLog(
    effect: { source: string; sourceType: 'var' | 'value' },
    ctx: TriggerContext
  ): void {
    const value = effect.sourceType === 'var'
      ? (ctx.chatVars[effect.source] ?? '')
      : effect.source;
    
    this.logs.push(value);
    console.log('[Trigger Log]', value);
  }
  
  /**
   * 특정 스크립트 ID로 실행
   */
  runById(id: string, context: TriggerContext): TriggerResult {
    const script = this.scripts.find(s => s.id === id);
    if (!script) {
      return {
        success: false,
        context,
        effectsExecuted: 0,
        errors: [{ message: `트리거를 찾을 수 없음: ${id}`, severity: 'error' }],
        logs: [],
        duration: 0,
      };
    }
    
    // 임시로 해당 스크립트만 설정 후 실행
    const originalScripts = this.scripts;
    this.scripts = [script];
    const result = this.run(script.type, context);
    this.scripts = originalScripts;
    
    return result;
  }
}
