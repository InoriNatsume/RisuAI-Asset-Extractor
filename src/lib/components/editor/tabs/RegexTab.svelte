<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import DSLEditor from '../DSLEditor.svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  $: regexList = getRegexList(data);
  
  let selectedIndex = -1;
  let viewMode: 'dsl' | 'raw' = 'dsl';
  let dslText = '';
  let searchTerm = '';
  let typeFilter = 'all';  // 타입 필터
  let dslEditor: DSLEditor;
  let displayMode: 'all' | 'single' = 'all';  // 전체 보기 vs 개별 보기
  let showHtmlPreview = false;  // HTML 미리보기 표시 여부

  // 코드 에디터 내 검색
  let codeSearchQuery = '';
  let codeSearchVisible = false;
  let codeSearchResultCount = 0;
  let codeSearchCurrentIndex = 0;

  // Regex 타입 목록 (RisuAI 스키마)
  const regexTypes = [
    { value: 'all', label: '전체' },
    { value: 'editinput', label: '입력 편집' },
    { value: 'editoutput', label: '출력 편집' },
    { value: 'editdisplay', label: '디스플레이 편집' },
    { value: 'editprocess', label: '프로세스 편집' },
    { value: 'edittrans', label: '번역 편집' },
  ];

  $: filteredList = regexList.filter(entry => {
    // 타입 필터
    if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
    // 검색 필터
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      entry.comment?.toLowerCase().includes(term) ||
      entry.in?.toLowerCase().includes(term)
    );
  });

  // DSL 텍스트: 선택 상태에 따라 전체 또는 개별 표시
  // displayMode와 selectedIndex를 명시적으로 참조하여 reactive 트리거
  $: {
    const _mode = displayMode;
    const _idx = selectedIndex;
    const _list = regexList;
    
    if (_mode === 'single' && _idx >= 0 && _idx < _list.length) {
      dslText = regexToDSL([_list[_idx]]);
      console.log('[RegexTab] Single mode - showing entry:', _idx, _list[_idx]?.comment);
    } else {
      dslText = regexToDSL(_list);
      console.log('[RegexTab] All mode - showing all:', _list.length, 'entries');
    }
  }

  function getRegexList(data: any): any[] {
    if (!data) return [];
    if (data.module?.regex) return data.module.regex;
    if (data.regex) return data.regex;
    return [];
  }

  function regexToDSL(entries: any[]): string {
    return entries.map(entry => {
      const lines: string[] = [];
      lines.push('===');
      if (entry.comment) lines.push(`name = "${escapeQuotes(entry.comment)}"`);
      if (entry.type) lines.push(`type = "${entry.type}"`);
      
      // pattern (in)
      if (entry.in) {
        const pattern = entry.in;
        // 긴 문자열(100자 이상)이거나 줄바꿈이 있으면 멀티라인 사용
        if (pattern.includes('\n') || pattern.length > 100) {
          lines.push(`pattern = '''`);
          lines.push(pattern);
          lines.push(`'''`);
        } else {
          lines.push(`pattern = "${escapeQuotes(pattern)}"`);
        }
      }
      
      // replace (out)
      if (entry.out) {
        const replace = entry.out;
        // 긴 문자열(100자 이상), 줄바꿈이 있거나, HTML 태그가 있으면 멀티라인 + 포맷팅
        const shouldFormat = replace.includes('\n') || replace.length > 100 || replace.includes('<');
        if (shouldFormat) {
          lines.push(`replace = '''`);
          // HTML 포맷팅: 주요 태그 앞에 줄바꿈 추가
          const formatted = formatLongString(replace);
          lines.push(formatted);
          lines.push(`'''`);
        } else {
          lines.push(`replace = "${escapeQuotes(replace)}"`);
        }
      }
      
      if (entry.flag) lines.push(`flags = "${entry.flag}"`);
      if (entry.ableFlag) lines.push(`ableFlag = "true"`);
      
      return lines.join('\n');
    }).join('\n\n');
  }

  /** 긴 HTML 문자열을 읽기 좋게 포맷팅 */
  function formatLongString(str: string): string {
    // HTML 태그가 없으면 그대로 반환
    if (!str.includes('<')) return str;
    
    // 줄바꿈이 있어도 HTML이면 추가 포맷팅 적용
    
    // 주요 블록 태그 앞뒤에 줄바꿈 추가
    let formatted = str
      .replace(/></g, '>\n<')  // 태그 사이에 줄바꿈
      .replace(/(<\/div>)/gi, '$1\n')  // div 닫기 후 줄바꿈
      .replace(/(<div)/gi, '\n$1')  // div 시작 전 줄바꿈
      .replace(/(<style)/gi, '\n$1')  // style 시작 전 줄바꿈
      .replace(/(<\/style>)/gi, '$1\n')  // style 닫기 후 줄바꿈
      .replace(/(<input)/gi, '\n$1')  // input 시작 전 줄바꿈
      .replace(/(<label)/gi, '\n$1')  // label 시작 전 줄바꿈
      .replace(/(<button)/gi, '\n$1')  // button 시작 전 줄바꿈
      .replace(/(<span)/gi, '\n$1')  // span 시작 전 줄바꿈
      .replace(/\n\n+/g, '\n')  // 중복 줄바꿈 제거
      .trim();
    
    return formatted;
  }

  function dslToRegex(dsl: string): any[] {
    const entries: any[] = [];
    const blocks = dsl.split(/^===$/m).filter(b => b.trim());
    
    for (const block of blocks) {
      const entry: any = {
        comment: '',
        in: '',
        out: '',
        flag: '',
        type: 'editinput',
        ableFlag: false
      };
      
      // 멀티라인 pattern
      const patternMatch = block.match(/pattern\s*=\s*'''([\s\S]*?)'''/);
      if (patternMatch) entry.in = patternMatch[1].trim();
      
      // 멀티라인 replace
      const replaceMatch = block.match(/replace\s*=\s*'''([\s\S]*?)'''/);
      if (replaceMatch) entry.out = replaceMatch[1].trim();
      
      const lines = block
        .replace(/pattern\s*=\s*'''[\s\S]*?'''/g, '')
        .replace(/replace\s*=\s*'''[\s\S]*?'''/g, '')
        .split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\w+)\s*=\s*(.+)$/);
        if (!match) continue;
        
        const [, key, rawValue] = match;
        let value = rawValue.trim();
        
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        
        switch (key) {
          case 'name': case 'comment': entry.comment = value; break;
          case 'type': entry.type = value; break;
          case 'pattern': if (!entry.in) entry.in = value; break;
          case 'replace': if (!entry.out) entry.out = value; break;
          case 'flag': case 'flags': entry.flag = value; break;
          case 'ableFlag': entry.ableFlag = value === 'true'; break;
        }
      }
      
      if (entry.comment || entry.in) entries.push(entry);
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

  function getTypeLabel(type: string): string {
    const typeLabels: Record<string, string> = {
      'editinput': 'IN',
      'editoutput': 'OUT',
      'editdisplay': 'DSP',
      'editprocess': 'PRC',
      'edittrans': 'TRS'
    };
    return typeLabels[type] || type?.slice(0, 3)?.toUpperCase() || 'IN';
  }

  function addEntry() {
    const newList = [...regexList, {
      comment: '새 Regex',
      in: '',
      out: '',
      flag: '',
      type: 'editinput',
      ableFlag: false
    }];
    updateRegexList(newList);
    selectedIndex = newList.length - 1;
  }

  function deleteEntry(index: number) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    const newList = regexList.filter((_, i) => i !== index);
    updateRegexList(newList);
    if (selectedIndex === index) selectedIndex = -1;
    else if (selectedIndex > index) selectedIndex--;
  }

  function handleDSLChange(event: CustomEvent<{ value: string }>) {
    dslText = event.detail.value;
  }

  function applyDSL() {
    try {
      const parsed = dslToRegex(dslText);
      
      if (displayMode === 'single' && selectedIndex >= 0 && parsed.length === 1) {
        // 개별 모드: 선택된 항목만 업데이트
        const newList = [...regexList];
        newList[selectedIndex] = parsed[0];
        updateRegexList(newList);
      } else {
        // 전체 모드: 전체 목록 교체
        updateRegexList(parsed);
      }
    } catch (e) {
      console.error('DSL 파싱 오류:', e);
      alert('DSL 파싱 오류');
    }
  }

  function updateRegexList(newList: any[]) {
    const newData = structuredClone(data);
    if (newData.module) newData.module.regex = newList;
    else newData.regex = newList;
    dispatch('change', newData);
  }

  function copyToClipboard() { navigator.clipboard.writeText(dslText); }

  async function pasteFromClipboard() {
    try { dslText = await navigator.clipboard.readText(); } catch {}
  }
</script>

<div class="regex-tab">
  <!-- 메인: DSL 코드 에디터 -->
  <main class="editor-panel">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button class="mode-btn" class:active={viewMode === 'dsl'} on:click={() => viewMode = 'dsl'}>DSL</button>
        <button class="mode-btn" class:active={viewMode === 'raw'} on:click={() => viewMode = 'raw'}>Raw</button>
        <span class="separator">|</span>
        {#if displayMode === 'single' && selectedIndex >= 0}
          <button class="mode-btn active-item" on:click={showAll}>
            📄 {regexList[selectedIndex]?.comment || '선택됨'} ×
          </button>
        {:else}
          <span class="view-label">전체 {regexList.length}개</span>
        {/if}
      </div>
      <div class="toolbar-right">
        <button class="tool-btn" on:click={() => codeSearchVisible = !codeSearchVisible} title="코드 검색" class:active={codeSearchVisible}>🔍</button>
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
          placeholder="코드 내 검색..."
          bind:value={codeSearchQuery}
          on:keydown={(e) => {
            if (e.key === 'Enter') dslEditor?.nextSearchResult();
            else if (e.key === 'Escape') { codeSearchVisible = false; codeSearchQuery = ''; }
          }}
        />
        <span class="code-search-count">
          {#if codeSearchResultCount > 0}
            {codeSearchCurrentIndex + 1} / {codeSearchResultCount}
          {:else if codeSearchQuery}
            0 / 0
          {/if}
        </span>
        <button class="code-search-nav" on:click={() => dslEditor?.prevSearchResult()}>▲</button>
        <button class="code-search-nav" on:click={() => dslEditor?.nextSearchResult()}>▼</button>
        <button class="code-search-close" on:click={() => { codeSearchVisible = false; codeSearchQuery = ''; }}>✕</button>
      </div>
    {/if}
    
    <div class="editor-wrapper">
      {#if viewMode === 'dsl'}
        <DSLEditor
          bind:this={dslEditor}
          value={dslText}
          mode="regex"
          searchQuery={codeSearchQuery}
          bind:searchResultCount={codeSearchResultCount}
          bind:currentSearchIndex={codeSearchCurrentIndex}
          placeholder={'===\nname = "Regex 이름"\ntype = "editdisplay"\npattern = "<img mps=\"(.*?)\">"\nreplace = \'\'\'\n대체 문자열\n\'\'\''}
          on:change={handleDSLChange}
        />
      {:else}
        <textarea
          class="code-editor raw-editor"
          value={JSON.stringify(regexList, null, 2)}
          on:input={(e) => { try { updateRegexList(JSON.parse(e.currentTarget.value)); } catch {} }}
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
        {#each regexTypes as rt}
          <option value={rt.value}>{rt.label}</option>
        {/each}
      </select>
    </div>
    
    <ul class="entry-list">
      {#each filteredList as entry, i}
        {@const originalIndex = regexList.indexOf(entry)}
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <li
          class="entry-item"
          class:selected={selectedIndex === originalIndex}
          on:click={() => selectEntry(originalIndex)}
          on:keydown={(e) => e.key === 'Enter' && selectEntry(originalIndex)}
        >
          <div class="entry-info">
            <span class="entry-name">{entry.comment || entry.in?.slice(0, 20) || '(이름 없음)'}</span>
            <div class="entry-meta">
              <span class="entry-type type-{entry.type || 'editinput'}">{getTypeLabel(entry.type)}</span>
              {#if entry.flag}
                <span class="entry-flags">/{entry.flag}/</span>
              {/if}
            </div>
          </div>
          <button class="btn-delete" on:click|stopPropagation={() => deleteEntry(originalIndex)} title="삭제">×</button>
        </li>
      {/each}
      
      {#if filteredList.length === 0}
        <li class="empty-message">{searchTerm ? '검색 결과 없음' : 'Regex가 없습니다'}</li>
      {/if}
    </ul>
    
    <div class="panel-footer">
      <button class="btn-add" on:click={addEntry}>+ 추가</button>
      <span class="count">총 {regexList.length}개</span>
    </div>
    
    <!-- HTML 미리보기 섹션 -->
    {#if selectedIndex >= 0 && regexList[selectedIndex]?.out?.includes('<')}
      <div class="html-preview-section">
        <div class="preview-header">
          <span>🖼️ HTML 미리보기</span>
          <button class="preview-toggle" on:click={() => showHtmlPreview = !showHtmlPreview}>
            {showHtmlPreview ? '접기' : '펼치기'}
          </button>
        </div>
        {#if showHtmlPreview}
          <div class="html-preview-container">
            {@html regexList[selectedIndex].out}
          </div>
        {/if}
      </div>
    {/if}
  </aside>
</div>

<style>
  .regex-tab {
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
    gap: 0.5rem;
    align-items: center;
  }

  .entry-type {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .entry-type.type-editinput { background: #3178c6; color: white; }
  .entry-type.type-editoutput { background: #238636; color: white; }
  .entry-type.type-editdisplay { background: #a855f7; color: white; }
  .entry-type.type-editprocess { background: #f97316; color: white; }
  .entry-type.type-edittrans { background: #ec4899; color: white; }

  .entry-flags {
    font-size: 0.625rem;
    color: var(--risu-theme-textcolor2, #888);
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }

  /* 미리보기 섹션 */
  .preview-section {
    border-top: 1px solid var(--risu-theme-borderc, #444);
    display: flex;
    flex-direction: column;
    max-height: 300px;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--risu-theme-darkbg, #252525);
    font-size: 0.75rem;
    color: var(--risu-theme-textcolor2, #888);
  }

  .preview-toggle {
    padding: 0.25rem 0.5rem;
    font-size: 0.625rem;
    background: var(--risu-theme-primary-600, #4682B4);
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }

  .preview-toggle:hover {
    background: var(--risu-theme-primary-700, #3a6d9e);
  }

  .preview-content {
    flex: 1;
    overflow: auto;
    padding: 0.5rem;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  .html-preview {
    background: white;
    color: black;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
    max-height: 200px;
    overflow: auto;
  }

  .code-preview {
    font-size: 0.75rem;
  }

  .preview-label {
    color: var(--risu-theme-textcolor2, #888);
    font-size: 0.625rem;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }

  .preview-code {
    background: rgba(0,0,0,0.3);
    padding: 0.5rem;
    border-radius: 4px;
    margin: 0 0 0.5rem 0;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.6875rem;
    color: var(--risu-theme-textcolor, #fff);
    max-height: 100px;
    overflow: auto;
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

  /* HTML 미리보기 섹션 */
  .html-preview-section {
    border-top: 1px solid var(--risu-theme-borderc, #444);
    padding: 0.5rem;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    color: var(--risu-theme-textcolor, #fff);
  }

  .preview-toggle {
    padding: 0.25rem 0.5rem;
    background: var(--risu-theme-darkbg, #252525);
    color: var(--risu-theme-textcolor2, #888);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .preview-toggle:hover {
    color: var(--risu-theme-textcolor, #fff);
  }

  .html-preview-container {
    max-height: 300px;
    overflow: auto;
    background: #fff;
    border-radius: 4px;
    padding: 0.5rem;
    font-size: 0.8rem;
  }
</style>
