/**
 * Risu Asset Extractor regex engine
 * 
 * RisuAI 호환 정규식 스크립트 처리 엔진
 */

import type {
  RegexScript,
  RegexMode,
  RegexResult,
  RegexMatchInfo,
  RegexError,
} from './types';

/**
 * 정규식 엔진 클래스
 */
export class RegexEngine {
  private scripts: RegexScript[] = [];
  
  /**
   * 스크립트 설정
   */
  setScripts(scripts: RegexScript[]): void {
    this.scripts = scripts;
  }
  
  /**
   * 스크립트 추가
   */
  addScript(script: RegexScript): void {
    this.scripts.push(script);
  }
  
  /**
   * 스크립트 제거
   */
  removeScript(id: string): void {
    this.scripts = this.scripts.filter(s => s.id !== id);
  }
  
  /**
   * 텍스트 처리
   */
  process(input: string, mode: RegexMode): RegexResult {
    const startTime = performance.now();
    const matches: RegexMatchInfo[] = [];
    const errors: RegexError[] = [];
    let output = input;
    let appliedCount = 0;
    
    for (const script of this.scripts) {
      // 모드 체크
      if (script.type !== mode) {
        continue;
      }
      
      // 빈 패턴 스킵
      if (!script.in) {
        continue;
      }
      
      try {
        const result = this.applyScript(output, script);
        
        if (result.matched) {
          output = result.output;
          matches.push(...result.matches);
          appliedCount++;
        }
      } catch (error) {
        errors.push({
          message: error instanceof Error ? error.message : String(error),
          scriptId: script.id,
          pattern: script.in,
          severity: 'error',
        });
      }
    }
    
    return {
      output,
      matches,
      appliedCount,
      errors,
      duration: performance.now() - startTime,
    };
  }
  
  /**
   * 단일 스크립트 적용
   */
  applyScript(
    input: string,
    script: RegexScript
  ): { output: string; matched: boolean; matches: RegexMatchInfo[] } {
    // 플래그 처리
    let flags = 'g';
    if (script.ableFlag && script.flag) {
      flags = this.sanitizeFlags(script.flag);
    }
    
    // 정규식 생성
    const regex = new RegExp(script.in, flags);
    
    // 매치 찾기
    const allMatches: RegexMatchInfo[] = [];
    let match: RegExpExecArray | null;
    
    // 글로벌 플래그가 없으면 한 번만 매치
    if (!flags.includes('g')) {
      match = regex.exec(input);
      if (match) {
        allMatches.push(this.createMatchInfo(match, script));
      }
    } else {
      // 글로벌 플래그가 있으면 모든 매치 찾기
      const tempRegex = new RegExp(script.in, flags);
      while ((match = tempRegex.exec(input)) !== null) {
        allMatches.push(this.createMatchInfo(match, script));
        // 무한 루프 방지
        if (match.index === tempRegex.lastIndex) {
          tempRegex.lastIndex++;
        }
      }
    }
    
    if (allMatches.length === 0) {
      return { output: input, matched: false, matches: [] };
    }
    
    // 치환 수행
    const outScript = this.processOutScript(script.out);
    const output = input.replace(regex, outScript);
    
    return {
      output,
      matched: true,
      matches: allMatches,
    };
  }
  
  /**
   * 매치 정보 생성
   */
  private createMatchInfo(
    match: RegExpExecArray,
    script: RegexScript
  ): RegexMatchInfo {
    return {
      scriptId: script.id,
      scriptName: script.comment,
      matched: match[0],
      replacement: this.processOutScript(script.out),
      index: match.index,
      groups: match.slice(1),
      namedGroups: match.groups,
    };
  }
  
  /**
   * 플래그 정리
   */
  private sanitizeFlags(flags: string): string {
    // 지원되는 플래그만 허용
    let sanitized = flags.trim().replace(/[^dgimsuvy]/g, '');
    
    // 중복 제거
    sanitized = [...new Set(sanitized.split(''))].join('');
    
    // 빈 문자열 방지
    if (sanitized.length === 0) {
      sanitized = 'u';
    }
    
    return sanitized;
  }
  
  /**
   * 출력 스크립트 처리
   */
  private processOutScript(out: string): string {
    // $n → 줄바꿈
    let processed = out.replaceAll('$n', '\n');
    
    // 끝에 > 있으면 줄바꿈 추가
    if (processed.endsWith('>')) {
      processed += '\n';
    }
    
    return processed;
  }
  
  /**
   * 정규식 유효성 검사
   */
  validatePattern(pattern: string, flags?: string): { valid: boolean; error?: string } {
    try {
      const sanitizedFlags = flags ? this.sanitizeFlags(flags) : 'g';
      new RegExp(pattern, sanitizedFlags);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 스크립트 테스트
   */
  testScript(
    input: string,
    script: RegexScript
  ): { output: string; matches: RegexMatchInfo[]; error?: string } {
    try {
      const result = this.applyScript(input, script);
      return {
        output: result.output,
        matches: result.matches,
      };
    } catch (error) {
      return {
        output: input,
        matches: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
