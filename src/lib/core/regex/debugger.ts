/**
 * Risu Asset Extractor regex debugger
 * 
 * 점진적 정규식 실행 디버거
 * 각 단계별로 매치 및 치환 과정을 추적
 */

import type {
  RegexScript,
  RegexMode,
  RegexMatchInfo,
  RegexDebugStep,
  RegexDebugResult,
} from './types';
import { RegexEngine } from './engine';

/**
 * 정규식 디버거 클래스
 */
export class RegexDebugger {
  private engine: RegexEngine;
  private scripts: RegexScript[] = [];
  private mode: RegexMode = 'editdisplay';
  
  // 현재 디버깅 상태
  private currentStep: number = 0;
  private currentInput: string = '';
  private steps: RegexDebugStep[] = [];
  private isRunning: boolean = false;
  
  constructor() {
    this.engine = new RegexEngine();
  }
  
  /**
   * 스크립트 설정
   */
  setScripts(scripts: RegexScript[]): void {
    this.scripts = scripts;
    this.engine.setScripts(scripts);
  }
  
  /**
   * 모드 설정
   */
  setMode(mode: RegexMode): void {
    this.mode = mode;
  }
  
  /**
   * 디버깅 초기화
   */
  init(input: string): void {
    this.currentInput = input;
    this.currentStep = 0;
    this.steps = [];
    this.isRunning = false;
  }
  
  /**
   * 전체 실행 (디버그 정보 포함)
   */
  runAll(input: string): RegexDebugResult {
    const startTime = performance.now();
    this.init(input);
    
    let currentText = input;
    let appliedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < this.scripts.length; i++) {
      const script = this.scripts[i];
      const stepStartTime = performance.now();
      
      const step: RegexDebugStep = {
        step: i + 1,
        script: {
          id: script.id,
          name: script.comment,
          pattern: script.in,
          replacement: script.out,
          flags: script.ableFlag ? (script.flag || 'g') : 'g',
        },
        input: currentText,
        output: currentText,
        matched: false,
        matches: [],
        duration: 0,
      };
      
      // 모드 불일치 체크
      if (script.type !== this.mode) {
        step.skipped = true;
        step.skipReason = `모드 불일치: ${script.type} ≠ ${this.mode}`;
        skippedCount++;
        step.duration = performance.now() - stepStartTime;
        this.steps.push(step);
        continue;
      }
      
      // 빈 패턴 체크
      if (!script.in) {
        step.skipped = true;
        step.skipReason = '빈 패턴';
        skippedCount++;
        step.duration = performance.now() - stepStartTime;
        this.steps.push(step);
        continue;
      }
      
      try {
        // 스크립트 적용
        const result = this.engine.applyScript(currentText, script);
        
        step.matched = result.matched;
        step.matches = result.matches;
        step.output = result.output;
        
        if (result.matched) {
          currentText = result.output;
          appliedCount++;
        }
      } catch (error) {
        step.error = {
          message: error instanceof Error ? error.message : String(error),
          scriptId: script.id,
          pattern: script.in,
          severity: 'error',
        };
        errorCount++;
      }
      
      step.duration = performance.now() - stepStartTime;
      this.steps.push(step);
    }
    
    return {
      originalInput: input,
      finalOutput: currentText,
      steps: this.steps,
      totalDuration: performance.now() - startTime,
      appliedCount,
      skippedCount,
      errorCount,
    };
  }
  
  /**
   * 다음 단계 실행
   */
  stepForward(): RegexDebugStep | null {
    if (this.currentStep >= this.scripts.length) {
      return null;
    }
    
    const script = this.scripts[this.currentStep];
    const stepStartTime = performance.now();
    
    // 현재 텍스트 결정
    const inputText = this.currentStep === 0
      ? this.currentInput
      : (this.steps[this.currentStep - 1]?.output ?? this.currentInput);
    
    const step: RegexDebugStep = {
      step: this.currentStep + 1,
      script: {
        id: script.id,
        name: script.comment,
        pattern: script.in,
        replacement: script.out,
        flags: script.ableFlag ? (script.flag || 'g') : 'g',
      },
      input: inputText,
      output: inputText,
      matched: false,
      matches: [],
      duration: 0,
    };
    
    // 모드 불일치 체크
    if (script.type !== this.mode) {
      step.skipped = true;
      step.skipReason = `모드 불일치: ${script.type} ≠ ${this.mode}`;
      step.duration = performance.now() - stepStartTime;
      this.steps.push(step);
      this.currentStep++;
      return step;
    }
    
    // 빈 패턴 체크
    if (!script.in) {
      step.skipped = true;
      step.skipReason = '빈 패턴';
      step.duration = performance.now() - stepStartTime;
      this.steps.push(step);
      this.currentStep++;
      return step;
    }
    
    try {
      const result = this.engine.applyScript(inputText, script);
      step.matched = result.matched;
      step.matches = result.matches;
      step.output = result.output;
    } catch (error) {
      step.error = {
        message: error instanceof Error ? error.message : String(error),
        scriptId: script.id,
        pattern: script.in,
        severity: 'error',
      };
    }
    
    step.duration = performance.now() - stepStartTime;
    this.steps.push(step);
    this.currentStep++;
    
    return step;
  }
  
  /**
   * 이전 단계로 이동
   */
  stepBackward(): RegexDebugStep | null {
    if (this.currentStep <= 0) {
      return null;
    }
    
    this.currentStep--;
    this.steps.pop();
    
    return this.steps[this.currentStep - 1] ?? null;
  }
  
  /**
   * 특정 단계로 이동
   */
  goToStep(stepNumber: number): RegexDebugStep | null {
    if (stepNumber < 1 || stepNumber > this.scripts.length) {
      return null;
    }
    
    // 초기화 후 해당 단계까지 실행
    const savedInput = this.currentInput;
    this.init(savedInput);
    
    for (let i = 0; i < stepNumber; i++) {
      this.stepForward();
    }
    
    return this.steps[stepNumber - 1] ?? null;
  }
  
  /**
   * 현재 상태 조회
   */
  getCurrentState(): {
    step: number;
    total: number;
    currentText: string;
    isComplete: boolean;
  } {
    const currentText = this.steps.length > 0
      ? this.steps[this.steps.length - 1].output
      : this.currentInput;
    
    return {
      step: this.currentStep,
      total: this.scripts.length,
      currentText,
      isComplete: this.currentStep >= this.scripts.length,
    };
  }
  
  /**
   * 현재까지의 단계 조회
   */
  getSteps(): RegexDebugStep[] {
    return [...this.steps];
  }
  
  /**
   * 특정 단계 조회
   */
  getStep(stepNumber: number): RegexDebugStep | null {
    return this.steps[stepNumber - 1] ?? null;
  }
  
  /**
   * 매치 하이라이트 HTML 생성
   */
  getHighlightedText(stepNumber: number): string {
    const step = this.getStep(stepNumber);
    if (!step || step.matches.length === 0) {
      return this.escapeHtml(step?.input ?? '');
    }
    
    const input = step.input;
    let result = '';
    let lastIndex = 0;
    
    // 매치 위치로 정렬
    const sortedMatches = [...step.matches].sort((a, b) => a.index - b.index);
    
    for (const match of sortedMatches) {
      // 매치 이전 텍스트
      result += this.escapeHtml(input.slice(lastIndex, match.index));
      
      // 매치된 텍스트 하이라이트
      result += `<span class="regex-match">${this.escapeHtml(match.matched)}</span>`;
      
      lastIndex = match.index + match.matched.length;
    }
    
    // 나머지 텍스트
    result += this.escapeHtml(input.slice(lastIndex));
    
    return result;
  }
  
  /**
   * 차이 비교 HTML 생성
   */
  getDiffHtml(stepNumber: number): { before: string; after: string } {
    const step = this.getStep(stepNumber);
    if (!step) {
      return { before: '', after: '' };
    }
    
    return {
      before: this.getHighlightedText(stepNumber),
      after: this.escapeHtml(step.output),
    };
  }
  
  /**
   * HTML 이스케이프
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }
  
  /**
   * 실행 중 여부
   */
  get running(): boolean {
    return this.isRunning;
  }
  
  /**
   * 디버깅 리셋
   */
  reset(): void {
    this.currentStep = 0;
    this.steps = [];
    this.isRunning = false;
  }
}
