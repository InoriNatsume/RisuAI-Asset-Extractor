/**
 * Risu Asset Extractor trigger tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerEngine, TriggerDebugger } from './index';
import type { TriggerScript, TriggerContext } from './types';

describe('TriggerEngine', () => {
  let engine: TriggerEngine;
  
  beforeEach(() => {
    engine = new TriggerEngine();
  });
  
  describe('기본 동작', () => {
    it('빈 스크립트 실행', () => {
      const context = engine.createContext();
      const result = engine.run('start', context);
      
      expect(result.success).toBe(true);
      expect(result.effectsExecuted).toBe(0);
    });
    
    it('변수 설정 효과', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'setvar', operator: '=', var: 'test', value: 'hello' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      const result = engine.run('start', context);
      
      expect(result.success).toBe(true);
      expect(result.context.chatVars['test']).toBe('hello');
    });
    
    it('변수 연산', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'setvar', operator: '=', var: 'count', value: '10' },
          { type: 'setvar', operator: '+=', var: 'count', value: '5' },
          { type: 'setvar', operator: '-=', var: 'count', value: '3' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      const result = engine.run('start', context);
      
      expect(result.context.chatVars['count']).toBe('12'); // 10 + 5 - 3
    });
  });
  
  describe('조건 처리', () => {
    it('변수 조건 - 일치', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [
          { type: 'var', var: 'ready', value: '1', operator: '=' },
        ],
        effect: [
          { type: 'setvar', operator: '=', var: 'result', value: 'executed' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      context.chatVars['ready'] = '1';
      
      const result = engine.run('start', context);
      
      expect(result.context.chatVars['result']).toBe('executed');
    });
    
    it('변수 조건 - 불일치', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [
          { type: 'var', var: 'ready', value: '1', operator: '=' },
        ],
        effect: [
          { type: 'setvar', operator: '=', var: 'result', value: 'executed' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      context.chatVars['ready'] = '0';
      
      const result = engine.run('start', context);
      
      expect(result.context.chatVars['result']).toBeUndefined();
    });
    
    it('숫자 비교 조건', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [
          { type: 'var', var: 'score', value: '50', operator: '>' },
        ],
        effect: [
          { type: 'setvar', operator: '=', var: 'grade', value: 'pass' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      context.chatVars['score'] = '75';
      
      const result = engine.run('start', context);
      
      expect(result.context.chatVars['grade']).toBe('pass');
    });
  });
  
  describe('채팅 조작', () => {
    it('채팅 수정', () => {
      const script: TriggerScript = {
        type: 'display',
        conditions: [],
        effect: [
          { type: 'modifychat', index: '0', value: 'modified content' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      context.chat = [
        { role: 'user', content: 'original content' },
      ];
      
      const result = engine.run('display', context);
      
      expect(result.context.chat[0].content).toBe('modified content');
    });
    
    it('채팅 잘라내기', () => {
      const script: TriggerScript = {
        type: 'request',
        conditions: [],
        effect: [
          { type: 'cutchat', start: '1', end: '3' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      context.chat = [
        { role: 'user', content: 'msg 0' },
        { role: 'char', content: 'msg 1' },
        { role: 'user', content: 'msg 2' },
        { role: 'char', content: 'msg 3' },
      ];
      
      const result = engine.run('request', context);
      
      expect(result.context.chat.length).toBe(2);
      expect(result.context.chat[0].content).toBe('msg 1');
      expect(result.context.chat[1].content).toBe('msg 2');
    });
  });
  
  describe('중단', () => {
    it('stop 효과로 중단', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'setvar', operator: '=', var: 'a', value: '1' },
          { type: 'stop' },
          { type: 'setvar', operator: '=', var: 'b', value: '2' },
        ],
      };
      
      engine.setScripts([script]);
      const context = engine.createContext();
      const result = engine.run('start', context);
      
      expect(result.context.chatVars['a']).toBe('1');
      expect(result.context.chatVars['b']).toBeUndefined();
      expect(result.context.stopped).toBe(true);
    });
  });
  
  describe('타입 필터링', () => {
    it('일치하는 타입만 실행', () => {
      const scripts: TriggerScript[] = [
        {
          type: 'start',
          conditions: [],
          effect: [
            { type: 'setvar', operator: '=', var: 'start', value: '1' },
          ],
        },
        {
          type: 'output',
          conditions: [],
          effect: [
            { type: 'setvar', operator: '=', var: 'output', value: '1' },
          ],
        },
      ];
      
      engine.setScripts(scripts);
      const context = engine.createContext();
      const result = engine.run('start', context);
      
      expect(result.context.chatVars['start']).toBe('1');
      expect(result.context.chatVars['output']).toBeUndefined();
    });
  });
});

describe('TriggerDebugger', () => {
  let debugger_: TriggerDebugger;
  
  beforeEach(() => {
    debugger_ = new TriggerDebugger();
  });
  
  describe('단계별 실행', () => {
    it('stepForward로 한 단계씩 실행', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'setvar', operator: '=', var: 'a', value: '1' },
          { type: 'setvar', operator: '=', var: 'b', value: '2' },
        ],
      };
      
      debugger_.setScript(script);
      debugger_.init();
      
      const step1 = debugger_.stepForward();
      expect(step1?.step).toBe(1);
      expect(step1?.afterContext.chatVars['a']).toBe('1');
      expect(step1?.afterContext.chatVars['b']).toBeUndefined();
      
      const step2 = debugger_.stepForward();
      expect(step2?.step).toBe(2);
      expect(step2?.afterContext.chatVars['b']).toBe('2');
    });
    
    it('runAll로 전체 실행', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'setvar', operator: '=', var: 'x', value: '10' },
          { type: 'setvar', operator: '+=', var: 'x', value: '5' },
          { type: 'v2ConsoleLog', sourceType: 'var', source: 'x', indent: 0 },
        ],
      };
      
      debugger_.setScript(script);
      const steps = debugger_.runAll();
      
      expect(steps.length).toBe(3);
      expect(steps[2].afterContext.chatVars['x']).toBe('15');
    });
  });
  
  describe('상태 조회', () => {
    it('getCurrentState 정확성', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'setvar', operator: '=', var: 'a', value: '1' },
          { type: 'setvar', operator: '=', var: 'b', value: '2' },
        ],
      };
      
      debugger_.setScript(script);
      debugger_.init();
      
      let state = debugger_.getCurrentState();
      expect(state.step).toBe(0);
      expect(state.total).toBe(2);
      expect(state.isComplete).toBe(false);
      
      debugger_.stepForward();
      state = debugger_.getCurrentState();
      expect(state.step).toBe(1);
      
      debugger_.stepForward();
      state = debugger_.getCurrentState();
      expect(state.step).toBe(2);
      expect(state.isComplete).toBe(true);
    });
  });
  
  describe('로그', () => {
    it('콘솔 로그 기록', () => {
      const script: TriggerScript = {
        type: 'start',
        conditions: [],
        effect: [
          { type: 'v2ConsoleLog', sourceType: 'value', source: 'hello world', indent: 0 },
        ],
      };
      
      debugger_.setScript(script);
      debugger_.runAll();
      
      const logs = debugger_.getLogs();
      expect(logs).toContain('hello world');
    });
  });
});
