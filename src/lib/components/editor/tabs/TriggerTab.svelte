<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import DSLEditor from '../DSLEditor.svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  $: triggerList = getTriggerList(data);
  
  let selectedIndex = -1;
  let viewMode: 'dsl' | 'raw' = 'dsl';
  let dslText = '';
  let searchTerm = '';
  let typeFilter = 'all';
  let dslEditor: DSLEditor;
  let displayMode: 'all' | 'single' = 'all';  // 전체 보기 vs 개별 보기
  
  // 코드 검색
  let codeSearchQuery = '';
  let codeSearchVisible = false;
  let codeSearchResultCount = 0;
  let codeSearchCurrentIndex = 0;

  // Trigger 타입 목록 (RisuAI 스키마)
  const triggerTypes = [
    { value: 'all', label: '전체' },
    { value: 'start', label: '시작' },
    { value: 'output', label: '출력' },
    { value: 'input', label: '입력' },
    { value: 'manual', label: '수동' },
    { value: 'always', label: '항상' },
    { value: 'afterevery', label: '매 턴 후' },
  ];

  $: filteredList = triggerList.filter(entry => {
    // 타입 필터
    if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
    // 검색 필터
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      entry.comment?.toLowerCase().includes(term) ||
      entry.type?.toLowerCase().includes(term)
    );
  });

  // DSL 텍스트: 선택 상태에 따라 전체 또는 개별 표시
  // displayMode와 selectedIndex를 명시적으로 참조하여 reactive 트리거
  $: {
    const _mode = displayMode;
    const _idx = selectedIndex;
    const _list = triggerList;
    
    if (_mode === 'single' && _idx >= 0 && _idx < _list.length) {
      dslText = triggerToDSL([_list[_idx]]);
      console.log('[TriggerTab] Single mode - showing entry:', _idx, _list[_idx]?.comment);
    } else {
      dslText = triggerToDSL(_list);
      console.log('[TriggerTab] All mode - showing all:', _list.length, 'entries');
    }
  }

  function getTriggerList(data: any): any[] {
    if (!data) return [];
    if (data.module?.trigger) return data.module.trigger;
    if (data.trigger) return data.trigger;
    return [];
  }

  function getTypeLabel(type: string): string {
    const typeLabels: Record<string, string> = {
      'start': '시작',
      'output': '출력',
      'input': '입력',
      'manual': '수동',
      'always': '항상',
      'afterevery': '매턴후'
    };
    return typeLabels[type] || type || '???';
  }

  function triggerToDSL(entries: any[]): string {
    return entries.map(entry => {
      const lines: string[] = [];
      lines.push('===');
      if (entry.comment) lines.push(`name = "${escapeQuotes(entry.comment)}"`);
      if (entry.type) lines.push(`type = "${entry.type}"`);
      
      // active 상태
      if (entry.active !== undefined) {
        lines.push(`active = "${entry.active ? 'true' : 'false'}"`);
      }
      
      // lowLevelAccess - 항상 표시
      lines.push(`lowLevelAccess = "${entry.lowLevelAccess ? 'true' : 'false'}"`);
      
      // regex 조건
      if (entry.regex) {
        lines.push(`regex = "${escapeQuotes(entry.regex)}"`);
      }
      
      // conditions (JSON 배열)
      if (entry.conditions && entry.conditions.length > 0) {
        const condStr = JSON.stringify(entry.conditions);
        if (condStr.includes('\n') || condStr.length > 60) {
          lines.push(`condition = '''`);
          lines.push(JSON.stringify(entry.conditions, null, 2));
          lines.push(`'''`);
        } else {
          lines.push(`condition = '${condStr}'`);
        }
      }
      
      // effect (JSON 배열 또는 코드) - 항상 멀티라인으로 표시
      if (entry.effect && entry.effect.length > 0) {
        const effectType = entry.effect[0]?.type;
        
        // triggerlua / triggercode는 코드 블록으로
        if ((effectType === 'triggerlua' || effectType === 'triggercode') && entry.effect[0]?.code) {
          lines.push(`effectType = "${effectType}"`);
          lines.push(`effect = '''`);
          lines.push(entry.effect[0].code);
          lines.push(`'''`);
        } else {
          // JSON은 항상 멀티라인으로
          lines.push(`effect = '''`);
          lines.push(JSON.stringify(entry.effect, null, 2));
          lines.push(`'''`);
        }
      }
      
      return lines.join('\n');
    }).join('\n\n');
  }

  function dslToTrigger(dsl: string): any[] {
    const entries: any[] = [];
    const blocks = dsl.split(/^===$/m).filter(b => b.trim());
    
    for (const block of blocks) {
      const entry: any = {
        comment: '',
        type: 'manual',
        conditions: [],
        effect: [],
        active: true
      };
      
      let effectType = '';
      
      // 멀티라인 condition
      const conditionMatch = block.match(/condition\s*=\s*'''([\s\S]*?)'''/);
      if (conditionMatch) {
        try {
          entry.conditions = JSON.parse(conditionMatch[1].trim());
        } catch {}
      }
      
      // 멀티라인 effect
      const effectMatch = block.match(/effect\s*=\s*'''([\s\S]*?)'''/);
      if (effectMatch) {
        const effectContent = effectMatch[1].trim();
        // JSON인지 코드인지 판단
        if (effectContent.startsWith('[')) {
          try {
            entry.effect = JSON.parse(effectContent);
          } catch {}
        } else {
          // 코드 블록 (나중에 effectType과 함께 처리)
          entry._effectCode = effectContent;
        }
      }
      
      const lines = block
        .replace(/condition\s*=\s*'''[\s\S]*?'''/g, '')
        .replace(/effect\s*=\s*'''[\s\S]*?'''/g, '')
        .split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\w+)\s*=\s*(.+)$/);
        if (!match) continue;
        
        const [, key, rawValue] = match;
        let value = rawValue.trim();
        
        // 따옴표 제거
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        switch (key) {
          case 'name': case 'comment': entry.comment = value; break;
          case 'type': entry.type = value; break;
          case 'active': entry.active = value === 'true'; break;
          case 'lowLevelAccess': entry.lowLevelAccess = value === 'true'; break;
          case 'regex': entry.regex = value; break;
          case 'effectType': effectType = value; break;
          case 'condition':
            if (!entry.conditions.length) {
              try { entry.conditions = JSON.parse(value); } catch {}
            }
            break;
          case 'effect':
            if (!entry.effect.length) {
              try { entry.effect = JSON.parse(value); } catch {}
            }
            break;
        }
      }
      
      // 코드 블록을 effect로 변환
      if (entry._effectCode && effectType) {
        entry.effect = [{
          type: effectType,
          code: entry._effectCode
        }];
        delete entry._effectCode;
      }
      
      if (entry.comment || entry.effect.length > 0) entries.push(entry);
    }
    
    return entries;
  }

  function escapeQuotes(str: string): string {
    return str.replace(/"/g, '\\"');
  }

  function selectEntry(index: number) {
    if (selectedIndex === index) {
      // 같은 항목 다시 클릭 시 선택 해제
      selectedIndex = -1;
      displayMode = 'all';
    } else {
      selectedIndex = index;
      displayMode = 'single';  // 개별 보기 모드로 전환
    }
  }

  function showAll() {
    selectedIndex = -1;
    displayMode = 'all';
  }

  async function scrollToEntry(index: number) {
    await tick();
    if (!dslEditor) return;
    
    const lines = dslText.split('\n');
    let lineIndex = 0;
    let entryCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '===') {
        if (entryCount === index) { lineIndex = i + 1; break; }
        entryCount++;
      }
    }
    
    dslEditor.scrollToLine(lineIndex);
  }

  function addEntry() {
    const newList = [...triggerList, {
      comment: '새 트리거',
      type: 'manual',
      conditions: [],
      effect: [],
      active: true
    }];
    updateTriggerList(newList);
    selectedIndex = newList.length - 1;
  }

  function deleteEntry(index: number) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    const newList = triggerList.filter((_, i) => i !== index);
    updateTriggerList(newList);
    if (selectedIndex === index) selectedIndex = -1;
    else if (selectedIndex > index) selectedIndex--;
  }

  function handleDSLChange(event: CustomEvent<{ value: string }>) {
    dslText = event.detail.value;
  }

  function applyDSL() {
    try {
      const parsed = dslToTrigger(dslText);
      
      if (displayMode === 'single' && selectedIndex >= 0 && parsed.length === 1) {
        // 개별 모드: 선택된 항목만 업데이트
        const newList = [...triggerList];
        newList[selectedIndex] = parsed[0];
        updateTriggerList(newList);
      } else {
        // 전체 모드: 전체 목록 교체
        updateTriggerList(parsed);
      }
    } catch (e) {
      console.error('DSL 파싱 오류:', e);
      alert('DSL 파싱 오류');
    }
  }

  function updateTriggerList(newList: any[]) {
    const newData = structuredClone(data);
    if (newData.module) newData.module.trigger = newList;
    else newData.trigger = newList;
    dispatch('change', newData);
  }

  function copyToClipboard() { navigator.clipboard.writeText(dslText); }

  async function pasteFromClipboard() {
    try { dslText = await navigator.clipboard.readText(); } catch {}
  }
</script>

<div class="trigger-tab">
  <!-- 메인: DSL 코드 에디터 -->
  <main class="editor-panel">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button class="mode-btn" class:active={viewMode === 'dsl'} on:click={() => viewMode = 'dsl'}>DSL</button>
        <button class="mode-btn" class:active={viewMode === 'raw'} on:click={() => viewMode = 'raw'}>Raw</button>
        <span class="separator">|</span>
        {#if displayMode === 'single' && selectedIndex >= 0}
          <button class="mode-btn active-item" on:click={showAll}>
            📄 {triggerList[selectedIndex]?.comment || '선택됨'} ×
          </button>
        {:else}
          <span class="view-label">전체 {triggerList.length}개</span>
        {/if}
      </div>
      <div class="toolbar-right">
        <button class="tool-btn" class:active={codeSearchVisible} on:click={() => { codeSearchVisible = !codeSearchVisible; if (!codeSearchVisible) codeSearchQuery = ''; }} title="검색 (Ctrl+F)">🔍</button>
        <button class="tool-btn" on:click={copyToClipboard} title="복사">📋</button>
        <button class="tool-btn" on:click={pasteFromClipboard} title="붙여넣기">📄</button>
        <button class="tool-btn apply-btn" on:click={applyDSL} title="적용">✓ 적용</button>
      </div>
    </div>
    
    <!-- 코드 검색 바 -->
    {#if codeSearchVisible}
      <div class="code-search-bar">
        <input
          type="text"
          class="code-search-input"
          placeholder="검색..."
          bind:value={codeSearchQuery}
          on:keydown={(e) => {
            if (e.key === 'Enter') {
              if (e.shiftKey) dslEditor?.prevSearchResult();
              else dslEditor?.nextSearchResult();
            } else if (e.key === 'Escape') {
              codeSearchVisible = false;
              codeSearchQuery = '';
            }
          }}
        />
        <span class="code-search-count">
          {#if codeSearchQuery && codeSearchResultCount > 0}
            {codeSearchCurrentIndex + 1}/{codeSearchResultCount}
          {:else if codeSearchQuery}
            0/0
          {/if}
        </span>
        <button class="code-search-nav" on:click={() => dslEditor?.prevSearchResult()} title="이전 (Shift+Enter)">▲</button>
        <button class="code-search-nav" on:click={() => dslEditor?.nextSearchResult()} title="다음 (Enter)">▼</button>
        <button class="code-search-close" on:click={() => { codeSearchVisible = false; codeSearchQuery = ''; }}>×</button>
      </div>
    {/if}
    
    <div class="editor-wrapper">
      {#if viewMode === 'dsl'}
        <DSLEditor
          bind:this={dslEditor}
          value={dslText}
          mode="trigger"
          placeholder={'===\nname = "트리거 이름"\ntype = "manual"\nactive = "true"\neffect = \'[{"type":"setvar","var":"count","value":"1","operator":"="}]\''}
          searchQuery={codeSearchQuery}
          bind:searchResultCount={codeSearchResultCount}
          bind:currentSearchIndex={codeSearchCurrentIndex}
          on:change={handleDSLChange}
        />
      {:else}
        <textarea
          class="code-editor raw-editor"
          value={JSON.stringify(triggerList, null, 2)}
          on:input={(e) => { try { updateTriggerList(JSON.parse(e.currentTarget.value)); } catch {} }}
          spellcheck="false"
        ></textarea>
      {/if}
    </div>
  </main>

  <!-- 우측: 북마크 패널 -->
  <aside class="bookmark-panel">
    <div class="panel-header">
      <input type="text" placeholder="🔍 검색..." bind:value={searchTerm} class="search-input" />
      <select bind:value={typeFilter} class="type-filter">
        {#each triggerTypes as tt}
          <option value={tt.value}>{tt.label}</option>
        {/each}
      </select>
    </div>
    
    <ul class="entry-list">
      {#each filteredList as entry, i}
        {@const originalIndex = triggerList.indexOf(entry)}
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <li
          class="entry-item"
          class:selected={selectedIndex === originalIndex}
          class:inactive={entry.active === false}
          on:click={() => selectEntry(originalIndex)}
          on:keydown={(e) => e.key === 'Enter' && selectEntry(originalIndex)}
        >
          <div class="entry-info">
            <span class="entry-name">{entry.comment || `트리거 ${originalIndex + 1}`}</span>
            <div class="entry-meta">
              <span class="entry-type type-{entry.type || 'manual'}">{getTypeLabel(entry.type)}</span>
              {#if entry.lowLevelAccess}
                <span class="entry-flag low-level" title="Low Level Access">⚡</span>
              {/if}
            </div>
          </div>
          <button class="btn-delete" on:click|stopPropagation={() => deleteEntry(originalIndex)} title="삭제">×</button>
        </li>
      {/each}
      
      {#if filteredList.length === 0}
        <li class="empty-message">{searchTerm ? '검색 결과 없음' : '트리거가 없습니다'}</li>
      {/if}
    </ul>
    
    <div class="panel-footer">
      <button class="btn-add" on:click={addEntry}>+ 추가</button>
      <span class="count">총 {triggerList.length}개</span>
    </div>
  </aside>
</div>

<style>
  .trigger-tab {
    display: flex;
    height: calc(100vh - 200px);
    min-height: 500px;
    gap: 0;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  /* 에디터 패널 (왼쪽) */
  .editor-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--risu-theme-darkbg, #252525);
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
  }

  .toolbar-left, .toolbar-right { display: flex; gap: 0.25rem; align-items: center; }

  .separator {
    color: var(--risu-theme-textcolor2, #666);
    margin: 0 0.25rem;
  }

  .view-label {
    font-size: 0.75rem;
    color: var(--risu-theme-textcolor2, #888);
  }

  .active-item {
    background: #4682B4 !important;
    color: white !important;
    border-color: #4682B4 !important;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mode-btn {
    padding: 0.375rem 0.75rem;
    background: transparent;
    color: var(--risu-theme-textcolor2, #888);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    transition: all 0.15s;
  }

  .mode-btn:hover { color: var(--risu-theme-textcolor, #fff); }
  .mode-btn.active {
    background: var(--risu-theme-primary-600, #4682B4);
    color: white;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .tool-btn {
    padding: 0.375rem 0.5rem;
    background: transparent;
    color: var(--risu-theme-textcolor2, #888);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    color: var(--risu-theme-textcolor, #fff);
    background: rgba(255,255,255,0.05);
  }

  .apply-btn {
    background: #238636;
    color: white;
    border-color: #238636;
  }

  .apply-btn:hover { background: #2ea043; }

  .editor-wrapper {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .raw-editor {
    width: 100%;
    height: 100%;
    padding: 1rem;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    color: #abb2bf;
    border: none;
    resize: none;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.8125rem;
    line-height: 1.5;
  }
  .raw-editor:focus { outline: none; }

  /* 북마크 패널 (오른쪽) - ModuleManager 스타일 */
  .bookmark-panel {
    width: 200px;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    background: var(--risu-theme-darkbg, #252525);
    border-left: 1px solid var(--risu-theme-borderc, #444);
  }

  .panel-header {
    padding: 0.5rem;
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
  }

  .search-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    color: var(--risu-theme-textcolor, #fff);
    font-size: 0.75rem;
  }

  .search-input::placeholder { color: var(--risu-theme-textcolor2, #888); }
  .search-input:focus {
    outline: none;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .entry-list {
    flex: 1;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  /* ModuleManager 스타일 - 테두리가 있는 아이템 */
  .entry-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    cursor: pointer;
    transition: all 0.15s;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    border: 1px solid transparent;
    border-radius: 6px;
  }

  .entry-item:hover {
    background: rgba(255,255,255,0.05);
    border-color: var(--risu-theme-borderc, #444);
  }

  .entry-item.selected {
    background: rgba(74, 144, 217, 0.15);
    border-color: #4A90D9;
  }

  .entry-item.inactive {
    opacity: 0.5;
  }

  .entry-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .entry-name {
    font-size: 0.8125rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--risu-theme-textcolor, #fff);
  }

  .entry-type {
    font-size: 0.6875rem;
    color: var(--risu-theme-textcolor2, #888);
  }

  .btn-delete {
    opacity: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #E06C75;
    padding: 0.125rem 0.25rem;
    transition: opacity 0.15s;
  }

  .entry-item:hover .btn-delete { opacity: 0.7; }
  .btn-delete:hover { opacity: 1 !important; }

  .empty-message {
    padding: 1rem;
    text-align: center;
    color: var(--risu-theme-textcolor2, #888);
    font-size: 0.75rem;
  }

  .panel-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    border-top: 1px solid var(--risu-theme-borderc, #444);
    font-size: 0.6875rem;
  }

  .btn-add {
    padding: 0.25rem 0.5rem;
    background: rgba(255,255,255,0.05);
    color: var(--risu-theme-textcolor, #fff);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.6875rem;
    transition: all 0.15s;
  }

  .btn-add:hover {
    background: rgba(255,255,255,0.1);
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .count { color: var(--risu-theme-textcolor2, #888); }

  /* 타입 필터 드롭다운 */
  .type-filter {
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    color: var(--risu-theme-textcolor, #fff);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .type-filter:focus {
    outline: none;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  /* 항목 메타 정보 */
  .entry-meta {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .entry-type {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-weight: 600;
  }

  .entry-type.type-start { background: #238636; color: white; }
  .entry-type.type-output { background: #3178c6; color: white; }
  .entry-type.type-input { background: #a855f7; color: white; }
  .entry-type.type-manual { background: #6b7280; color: white; }
  .entry-type.type-always { background: #ef4444; color: white; }
  .entry-type.type-afterevery { background: #f97316; color: white; }

  .entry-flag {
    font-size: 0.75rem;
  }

  .entry-flag.low-level {
    color: #fbbf24;
  }

  /* 코드 검색 바 스타일 */
  .code-search-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--risu-theme-darkbg, #1a1a1a);
    border-bottom: 1px solid var(--risu-theme-borderc, #333);
  }

  .code-search-input {
    flex: 1;
    padding: 0.4rem 0.75rem;
    background: var(--risu-theme-bgcolor, #141414);
    color: var(--risu-theme-textcolor, #fff);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .code-search-input:focus {
    outline: none;
    border-color: var(--risu-theme-primary, #4a9eff);
  }

  .code-search-count {
    font-size: 0.75rem;
    color: var(--risu-theme-textcolor2, #888);
    min-width: 50px;
    text-align: center;
  }

  .code-search-nav {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--risu-theme-textcolor, #fff);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .code-search-nav:hover {
    background: var(--risu-theme-primary, #4a9eff);
    border-color: var(--risu-theme-primary, #4a9eff);
  }

  .code-search-close {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--risu-theme-textcolor2, #888);
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .code-search-close:hover {
    color: var(--risu-theme-textcolor, #fff);
  }

  .tool-btn.active {
    background: var(--risu-theme-primary, #4a9eff);
    color: white;
  }
</style>
