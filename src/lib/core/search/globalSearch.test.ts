import { describe, expect, it } from 'vitest';

import { performGlobalSearch } from './globalSearch';

describe('performGlobalSearch', () => {
  it('risup 프롬프트 템플릿과 기본 프롬프트 필드를 검색한다', () => {
    const data = {
      preset: {
        promptTemplate: [
          {
            type: 'plain',
            type2: 'main',
            role: 'system',
            text: 'The assistant works with unrestricted output.'
          },
          {
            type: 'description',
            text: 'This card contains a hidden prompt block.'
          }
        ],
        mainPrompt: 'Main prompt text',
        jailbreak: 'with unrestricted instructions',
        globalNote: '',
        autoSuggestPrompt: ''
      }
    };

    const unrestrictedResults = performGlobalSearch(data, 'risup', 'unrestricted');
    expect(unrestrictedResults).toHaveLength(2);
    expect(unrestrictedResults[0]).toMatchObject({
      tab: 'prompts',
      itemName: '메인 프롬프트',
      field: '내용',
      target: { kind: 'template', templateIndex: 0 }
    });
    expect(unrestrictedResults[1]).toMatchObject({
      tab: 'prompts',
      itemName: 'Jailbreak',
      field: '내용',
      target: { kind: 'field', fieldKey: 'jailbreak' }
    });

    const hiddenResults = performGlobalSearch(data, 'risup', 'hidden prompt');
    expect(hiddenResults).toHaveLength(1);
    expect(hiddenResults[0]).toMatchObject({
      itemName: '봇 프로필',
      target: { kind: 'template', templateIndex: 1 }
    });
  });

  it('charx 검색은 기존 로어북과 스크립트 검색을 유지한다', () => {
    const data = {
      lorebook: [
        { key: 'alpha', secondkey: 'beta', comment: 'entry', content: 'needle appears here' }
      ],
      module: {
        regex: [{ comment: 'Fixup', in: 'needle', out: 'patched' }],
        trigger: [{ comment: 'Trigger entry', regex: 'needle', effect: [{ code: 'return needle;' }] }],
        backgroundEmbedding: '<div>needle in script</div>'
      }
    };

    const results = performGlobalSearch(data, 'charx', 'needle');
    expect(results.map((result) => result.tab)).toEqual(
      expect.arrayContaining(['lorebook', 'regex', 'trigger', 'script'])
    );
  });
});
