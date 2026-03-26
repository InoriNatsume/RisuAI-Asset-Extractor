/**
 * Risu Asset Extractor regex tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RegexEngine, RegexDebugger } from './index';
import type { RegexScript } from './types';

describe('RegexEngine', () => {
  let engine: RegexEngine;
  
  beforeEach(() => {
    engine = new RegexEngine();
  });
  
  describe('기본 동작', () => {
    it('단순 문자열 치환', () => {
      const script: RegexScript = {
        in: 'hello',
        out: 'hi',
        type: 'editdisplay',
      };
      
      engine.setScripts([script]);
      const result = engine.process('hello world', 'editdisplay');
      
      expect(result.output).toBe('hi world');
      expect(result.appliedCount).toBe(1);
      expect(result.matches.length).toBe(1);
    });
    
    it('정규식 패턴 사용', () => {
      const script: RegexScript = {
        in: '\\d+',
        out: '#',
        type: 'editdisplay',
      };
      
      engine.setScripts([script]);
      const result = engine.process('test123abc456', 'editdisplay');
      
      expect(result.output).toBe('test#abc#');
      expect(result.matches.length).toBe(2);
    });
    
    it('캡처 그룹 사용', () => {
      const script: RegexScript = {
        in: '(\\w+)@(\\w+)',
        out: '$1 at $2',
        type: 'editdisplay',
      };
      
      engine.setScripts([script]);
      const result = engine.process('user@domain', 'editdisplay');
      
      expect(result.output).toBe('user at domain');
    });
    
    it('플래그 처리 (대소문자 무시)', () => {
      const script: RegexScript = {
        in: 'hello',
        out: 'hi',
        type: 'editdisplay',
        ableFlag: true,
        flag: 'gi',
      };
      
      engine.setScripts([script]);
      const result = engine.process('Hello HELLO hello', 'editdisplay');
      
      expect(result.output).toBe('hi hi hi');
    });
    
    it('$n은 줄바꿈으로 변환', () => {
      const script: RegexScript = {
        in: '\\|\\|\\|',
        out: '$n',
        type: 'editdisplay',
      };
      
      engine.setScripts([script]);
      const result = engine.process('line1|||line2|||line3', 'editdisplay');
      
      expect(result.output).toBe('line1\nline2\nline3');
    });
  });
  
  describe('모드 필터링', () => {
    it('모드가 일치하는 스크립트만 적용', () => {
      const scripts: RegexScript[] = [
        { in: 'a', out: '1', type: 'editinput' },
        { in: 'b', out: '2', type: 'editoutput' },
        { in: 'c', out: '3', type: 'editdisplay' },
      ];
      
      engine.setScripts(scripts);
      
      const inputResult = engine.process('abc', 'editinput');
      expect(inputResult.output).toBe('1bc');
      
      const outputResult = engine.process('abc', 'editoutput');
      expect(outputResult.output).toBe('a2c');
      
      const displayResult = engine.process('abc', 'editdisplay');
      expect(displayResult.output).toBe('ab3');
    });
  });
  
  describe('다중 스크립트', () => {
    it('순서대로 적용', () => {
      const scripts: RegexScript[] = [
        { in: 'a', out: 'b', type: 'editdisplay' },
        { in: 'b', out: 'c', type: 'editdisplay' },
      ];
      
      engine.setScripts(scripts);
      const result = engine.process('a', 'editdisplay');
      
      // a -> b -> c
      expect(result.output).toBe('c');
      expect(result.appliedCount).toBe(2);
    });
  });
  
  describe('에러 처리', () => {
    it('잘못된 정규식 패턴', () => {
      const script: RegexScript = {
        in: '[',
        out: 'x',
        type: 'editdisplay',
      };
      
      engine.setScripts([script]);
      const result = engine.process('test', 'editdisplay');
      
      expect(result.errors.length).toBe(1);
      expect(result.output).toBe('test'); // 원본 유지
    });
    
    it('빈 패턴은 스킵', () => {
      const scripts: RegexScript[] = [
        { in: '', out: 'x', type: 'editdisplay' },
        { in: 'a', out: 'b', type: 'editdisplay' },
      ];
      
      engine.setScripts(scripts);
      const result = engine.process('a', 'editdisplay');
      
      expect(result.output).toBe('b');
      expect(result.appliedCount).toBe(1);
    });
  });
  
  describe('유효성 검사', () => {
    it('유효한 패턴', () => {
      const result = engine.validatePattern('[a-z]+');
      expect(result.valid).toBe(true);
    });
    
    it('무효한 패턴', () => {
      const result = engine.validatePattern('[');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('RegexDebugger', () => {
  let debugger_: RegexDebugger;
  
  beforeEach(() => {
    debugger_ = new RegexDebugger();
  });
  
  describe('전체 실행', () => {
    it('runAll은 모든 단계 정보 반환', () => {
      const scripts: RegexScript[] = [
        { id: '1', in: 'a', out: 'b', type: 'editdisplay' },
        { id: '2', in: 'b', out: 'c', type: 'editdisplay' },
        { id: '3', in: 'x', out: 'y', type: 'editinput' }, // 모드 불일치
      ];
      
      debugger_.setScripts(scripts);
      debugger_.setMode('editdisplay');
      
      const result = debugger_.runAll('a');
      
      expect(result.originalInput).toBe('a');
      expect(result.finalOutput).toBe('c');
      expect(result.steps.length).toBe(3);
      expect(result.appliedCount).toBe(2);
      expect(result.skippedCount).toBe(1);
    });
  });
  
  describe('단계별 실행', () => {
    it('stepForward로 한 단계씩 실행', () => {
      const scripts: RegexScript[] = [
        { id: '1', in: 'a', out: 'b', type: 'editdisplay' },
        { id: '2', in: 'b', out: 'c', type: 'editdisplay' },
      ];
      
      debugger_.setScripts(scripts);
      debugger_.setMode('editdisplay');
      debugger_.init('a');
      
      const step1 = debugger_.stepForward();
      expect(step1?.step).toBe(1);
      expect(step1?.input).toBe('a');
      expect(step1?.output).toBe('b');
      expect(step1?.matched).toBe(true);
      
      const step2 = debugger_.stepForward();
      expect(step2?.step).toBe(2);
      expect(step2?.input).toBe('b');
      expect(step2?.output).toBe('c');
      
      const step3 = debugger_.stepForward();
      expect(step3).toBeNull(); // 더 이상 없음
    });
    
    it('goToStep으로 특정 단계로 이동', () => {
      const scripts: RegexScript[] = [
        { id: '1', in: 'a', out: 'b', type: 'editdisplay' },
        { id: '2', in: 'b', out: 'c', type: 'editdisplay' },
        { id: '3', in: 'c', out: 'd', type: 'editdisplay' },
      ];
      
      debugger_.setScripts(scripts);
      debugger_.setMode('editdisplay');
      debugger_.init('a');
      
      const step = debugger_.goToStep(2);
      
      expect(step?.step).toBe(2);
      expect(step?.output).toBe('c');
      
      const state = debugger_.getCurrentState();
      expect(state.step).toBe(2);
      expect(state.currentText).toBe('c');
    });
  });
  
  describe('상태 조회', () => {
    it('getCurrentState 정확성', () => {
      const scripts: RegexScript[] = [
        { in: 'a', out: 'b', type: 'editdisplay' },
        { in: 'b', out: 'c', type: 'editdisplay' },
      ];
      
      debugger_.setScripts(scripts);
      debugger_.setMode('editdisplay');
      debugger_.init('a');
      
      let state = debugger_.getCurrentState();
      expect(state.step).toBe(0);
      expect(state.currentText).toBe('a');
      expect(state.isComplete).toBe(false);
      
      debugger_.stepForward();
      state = debugger_.getCurrentState();
      expect(state.step).toBe(1);
      expect(state.currentText).toBe('b');
      
      debugger_.stepForward();
      state = debugger_.getCurrentState();
      expect(state.step).toBe(2);
      expect(state.isComplete).toBe(true);
    });
  });
  
  describe('하이라이트', () => {
    it('매치된 부분 하이라이트', () => {
      const scripts: RegexScript[] = [
        { in: 'hello', out: 'hi', type: 'editdisplay' },
      ];
      
      debugger_.setScripts(scripts);
      debugger_.setMode('editdisplay');
      debugger_.runAll('say hello world');
      
      const highlighted = debugger_.getHighlightedText(1);
      
      expect(highlighted).toContain('<span class="regex-match">hello</span>');
      expect(highlighted).toContain('say ');
      expect(highlighted).toContain(' world');
    });
  });
});
