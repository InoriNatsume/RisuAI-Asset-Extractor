export type SearchableFileType = 'charx' | 'risum' | 'risup';

export interface GlobalSearchTarget {
  kind: 'list-item' | 'template' | 'field';
  templateIndex?: number;
  fieldKey?: string;
}

export interface GlobalSearchResult {
  tab: string;
  tabLabel: string;
  itemIndex: number;
  itemName: string;
  field: string;
  matchText: string;
  matchCount: number;
  target?: GlobalSearchTarget;
}

type SearchAdapter = (data: any, normalizedQuery: string) => GlobalSearchResult[];

const presetPromptFields = [
  { key: 'mainPrompt', label: '메인 프롬프트' },
  { key: 'jailbreak', label: 'Jailbreak' },
  { key: 'globalNote', label: 'Global Note' },
  { key: 'autoSuggestPrompt', label: 'Auto Suggest Prompt' }
] as const;

const searchAdapters: Record<SearchableFileType, SearchAdapter> = {
  charx: searchBotOrModule,
  risum: searchBotOrModule,
  risup: searchPreset
};

export function performGlobalSearch(
  data: any,
  fileType: SearchableFileType,
  query: string
): GlobalSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || !data) {
    return [];
  }

  return searchAdapters[fileType]?.(data, normalizedQuery) ?? [];
}

function searchBotOrModule(data: any, normalizedQuery: string): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];

  const lorebook = data?.module?.lorebook || data?.lorebook || [];
  lorebook.forEach((item: any, idx: number) => {
    pushFields(results, [
      createTextSearchEntry('lorebook', '📚 로어북', idx, item?.comment || item?.key || `항목 ${idx + 1}`, 'key', item?.key, {
        kind: 'list-item'
      }),
      createTextSearchEntry('lorebook', '📚 로어북', idx, item?.comment || item?.key || `항목 ${idx + 1}`, 'secondkey', item?.secondkey, {
        kind: 'list-item'
      }),
      createTextSearchEntry('lorebook', '📚 로어북', idx, item?.comment || item?.key || `항목 ${idx + 1}`, 'comment', item?.comment, {
        kind: 'list-item'
      }),
      createTextSearchEntry('lorebook', '📚 로어북', idx, item?.comment || item?.key || `항목 ${idx + 1}`, 'content', item?.content, {
        kind: 'list-item'
      })
    ], normalizedQuery);
  });

  const regex = data?.module?.regex || data?.regex || [];
  regex.forEach((item: any, idx: number) => {
    pushFields(results, [
      createTextSearchEntry('regex', '⚙️ Regex', idx, item?.comment || `Regex ${idx + 1}`, '이름', item?.comment, {
        kind: 'list-item'
      }),
      createTextSearchEntry('regex', '⚙️ Regex', idx, item?.comment || `Regex ${idx + 1}`, 'pattern', item?.in, {
        kind: 'list-item'
      }),
      createTextSearchEntry('regex', '⚙️ Regex', idx, item?.comment || `Regex ${idx + 1}`, 'replacement', item?.out, {
        kind: 'list-item'
      })
    ], normalizedQuery);
  });

  const trigger = data?.module?.trigger || data?.trigger || [];
  trigger.forEach((item: any, idx: number) => {
    let effectCode = '';
    if (Array.isArray(item?.effect)) {
      item.effect.forEach((effect: any) => {
        if (effect?.code) effectCode += `${effect.code}\n`;
        if (effect?.value !== undefined) effectCode += `${JSON.stringify(effect.value)}\n`;
      });
    }

    pushFields(results, [
      createTextSearchEntry('trigger', '⚡ Trigger', idx, item?.comment || `Trigger ${idx + 1}`, '이름', item?.comment, {
        kind: 'list-item'
      }),
      createTextSearchEntry('trigger', '⚡ Trigger', idx, item?.comment || `Trigger ${idx + 1}`, 'regex', item?.regex, {
        kind: 'list-item'
      }),
      createTextSearchEntry(
        'trigger',
        '⚡ Trigger',
        idx,
        item?.comment || `Trigger ${idx + 1}`,
        'conditions',
        Array.isArray(item?.conditions) ? JSON.stringify(item.conditions) : '',
        { kind: 'list-item' }
      ),
      createTextSearchEntry(
        'trigger',
        '⚡ Trigger',
        idx,
        item?.comment || `Trigger ${idx + 1}`,
        'effect/code',
        effectCode || JSON.stringify(item?.effect || []),
        { kind: 'list-item' }
      )
    ], normalizedQuery);
  });

  const backgroundEmbedding =
    data?.cardData?.extensions?.risuai?.backgroundHTML || data?.module?.backgroundEmbedding || '';
  pushFields(results, [
    createTextSearchEntry('script', '📜 스크립트', 0, '백그라운드 임베딩', 'backgroundEmbedding', backgroundEmbedding, {
      kind: 'list-item'
    })
  ], normalizedQuery);

  return results;
}

function searchPreset(data: any, normalizedQuery: string): GlobalSearchResult[] {
  const results: GlobalSearchResult[] = [];
  const preset = data?.preset || data || {};
  const promptTemplate = Array.isArray(preset?.promptTemplate) ? preset.promptTemplate : [];

  promptTemplate.forEach((item: any, idx: number) => {
    const itemName = getPromptItemName(item, idx);
    pushFields(results, [
      createTextSearchEntry('prompts', '📝 프롬프트', idx, itemName, '이름', item?.name, {
        kind: 'template',
        templateIndex: idx
      }),
      createTextSearchEntry('prompts', '📝 프롬프트', idx, itemName, '역할', item?.role, {
        kind: 'template',
        templateIndex: idx
      }),
      createTextSearchEntry('prompts', '📝 프롬프트', idx, itemName, '내용', item?.text ?? item?.content ?? '', {
        kind: 'template',
        templateIndex: idx
      })
    ], normalizedQuery);
  });

  presetPromptFields.forEach((field, idx) => {
    pushFields(results, [
      createTextSearchEntry('prompts', '📝 프롬프트', idx, field.label, '내용', preset?.[field.key], {
        kind: 'field',
        fieldKey: field.key
      })
    ], normalizedQuery);
  });

  return results;
}

function pushFields(
  results: GlobalSearchResult[],
  entries: Array<ReturnType<typeof createTextSearchEntry>>,
  normalizedQuery: string
) {
  entries.forEach((entry) => {
    if (!entry) return;
    const matchCount = countMatches(entry.rawText, normalizedQuery);
    if (matchCount === 0) return;

    results.push({
      tab: entry.tab,
      tabLabel: entry.tabLabel,
      itemIndex: entry.itemIndex,
      itemName: entry.itemName,
      field: entry.field,
      matchText: getMatchPreview(entry.rawText, normalizedQuery),
      matchCount,
      target: entry.target
    });
  });
}

function createTextSearchEntry(
  tab: string,
  tabLabel: string,
  itemIndex: number,
  itemName: string,
  field: string,
  value: unknown,
  target?: GlobalSearchTarget
) {
  return {
    tab,
    tabLabel,
    itemIndex,
    itemName,
    field,
    rawText: stringifySearchValue(value),
    target
  };
}

function stringifySearchValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function countMatches(text: string, normalizedQuery: string): number {
  const normalizedText = text.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = normalizedText.indexOf(normalizedQuery, pos)) !== -1) {
    count += 1;
    pos += 1;
  }
  return count;
}

function getMatchPreview(text: string, normalizedQuery: string): string {
  const normalizedText = text.toLowerCase();
  const pos = normalizedText.indexOf(normalizedQuery);
  if (pos === -1) {
    return '';
  }

  const start = Math.max(0, pos - 20);
  const end = Math.min(text.length, pos + normalizedQuery.length + 40);
  let preview = text.slice(start, end);
  if (start > 0) preview = `...${preview}`;
  if (end < text.length) preview = `${preview}...`;
  return preview;
}

function getPromptItemName(item: any, idx: number): string {
  if (!item) return `프롬프트 ${idx + 1}`;
  if (item.name) return item.name;

  const type = item.type;
  const type2 = item.type2;

  if (type === 'plain' || type === 'jailbreak' || type === 'cot') {
    if (type2 === 'main') return '메인 프롬프트';
    if (type2 === 'globalNote') return '글로벌노트';
    if (type === 'jailbreak') return 'Jailbreak';
    if (type === 'cot') return 'Chain of Thought';
    return type || `프롬프트 ${idx + 1}`;
  }

  if (type === 'persona') return '페르소나 프로필';
  if (type === 'description') return '봇 프로필';
  if (type === 'lorebook') return '로어북';
  if (type === 'postEverything') return 'Post Everything';
  if (type === 'authornote') return 'Author Note';
  if (type === 'chat') return '채팅 기록';
  if (type === 'memory') return '메모리';
  if (type === 'cache') return `캐시 (${item.name || ''})`.trim();
  if (type === 'chatML') return 'ChatML';
  if (type === 'comment') return '주석';

  return type || `프롬프트 ${idx + 1}`;
}
