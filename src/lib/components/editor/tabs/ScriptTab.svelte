<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let data: any;
  export let fileType: 'charx' | 'jpeg' | 'png' | 'risum' = 'risum';

  const dispatch = createEventDispatcher();

  // 데이터 추출
  $: scriptData = getScriptData(data, fileType);

  function getScriptData(data: any, type: string) {
    console.log('[ScriptTab] getScriptData called:', { type, dataKeys: Object.keys(data || {}) });
    
    // charx, jpeg, png 모두 동일한 CCv3 구조
    if (type === 'charx' || type === 'jpeg' || type === 'png') {
      // transformCharxData 반환 구조: { card, cardData, lorebook, regex, trigger, assets, ... }
      // cardData = card.data (이미 추출됨)
      const cardData = data?.cardData || data?.card?.data || data;
      const risuExt = cardData?.extensions?.risuai || {};
      
      // charx 내부 module.risum에서 backgroundEmbedding 확인
      const moduleData = data?._moduleData;
      
      console.log('[ScriptTab] charx/jpeg/png paths:', {
        hasCardData: !!data?.cardData,
        hasCard: !!data?.card,
        hasModuleData: !!moduleData,
        cardData_keys: Object.keys(cardData || {}),
        extensions_keys: Object.keys(cardData?.extensions || {}),
        risuExt_keys: Object.keys(risuExt),
        backgroundHTML: risuExt?.backgroundHTML?.substring?.(0, 100) || risuExt?.backgroundHTML,
        moduleBackgroundEmbedding: moduleData?.backgroundEmbedding?.substring?.(0, 100),
      });
      
      // 우선순위: risuExt.backgroundHTML > moduleData.backgroundEmbedding
      const backgroundEmbedding = risuExt?.backgroundHTML || moduleData?.backgroundEmbedding || '';
      
      return {
        backgroundEmbedding,
      };
    } else {
      // risum 모듈
      const module = data?.module || data;
      console.log('[ScriptTab] risum paths:', {
        module_keys: Object.keys(module || {}),
        backgroundEmbedding: module?.backgroundEmbedding,
      });
      
      return {
        backgroundEmbedding: module?.backgroundEmbedding || '',
      };
    }
  }

  // 로컬 편집 상태
  let localData: Record<string, string> = { ...scriptData };
  $: localData = { ...scriptData };

  function handleChange(field: string, value: string) {
    localData[field] = value;
    applyChanges();
  }

  function applyChanges() {
    const newData = structuredClone(data);
    
    // charx, jpeg, png 모두 동일한 CCv3 구조
    if (fileType === 'charx' || fileType === 'jpeg' || fileType === 'png') {
      // charx 구조: cardData.extensions.risuai.backgroundHTML
      // transformCharxData 반환: { card, cardData, ... } 형태
      // cardData = card.data 이므로 둘 다 업데이트
      if (!newData.cardData) newData.cardData = {};
      if (!newData.cardData.extensions) newData.cardData.extensions = {};
      if (!newData.cardData.extensions.risuai) newData.cardData.extensions.risuai = {};
      newData.cardData.extensions.risuai.backgroundHTML = localData.backgroundEmbedding;
      
      // card.data도 동기화 (내보내기 용)
      if (newData.card?.data) {
        if (!newData.card.data.extensions) newData.card.data.extensions = {};
        if (!newData.card.data.extensions.risuai) newData.card.data.extensions.risuai = {};
        newData.card.data.extensions.risuai.backgroundHTML = localData.backgroundEmbedding;
      }
    } else {
      // risum 구조
      if (!newData.module) newData.module = {};
      newData.module.backgroundEmbedding = localData.backgroundEmbedding;
    }
    
    dispatch('change', newData);
  }

  // CSS/HTML 코드 포맷팅
  function formatCode() {
    let code = localData.backgroundEmbedding;
    if (!code) return;
    
    // CSS 포맷팅: } 뒤에 줄바꿈, { 앞에 줄바꿈
    code = code
      // 기존 줄바꿈 정리
      .replace(/\s*\n\s*/g, ' ')
      // } 뒤에 줄바꿈
      .replace(/}\s*/g, '}\n')
      // { 뒤에 줄바꿈
      .replace(/{\s*/g, ' {\n  ')
      // ; 뒤에 줄바꿈 (CSS 속성)
      .replace(/;\s*/g, ';\n  ')
      // /* 앞에 줄바꿈 (주석)
      .replace(/\s*\/\*/g, '\n/* ')
      // */ 뒤에 줄바꿈
      .replace(/\*\/\s*/g, ' */\n')
      // 중첩 정리
      .replace(/\n\s*\n/g, '\n')
      // 끝 공백 정리
      .replace(/\n\s+}/g, '\n}')
      .trim();
    
    localData.backgroundEmbedding = code;
    applyChanges();
  }

  // CSS/HTML 구문 강조
  function highlightCode(code: string): string {
    if (!code) return '';
    
    // HTML 이스케이프
    let html = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // 주석 /* ... */
    html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');
    
    // HTML 태그 <style>, </style>, <div> 등
    html = html.replace(/(&lt;\/?)([\w-]+)([^&]*?)(&gt;)/g, 
      '$1<span class="hl-tag">$2</span>$3$4');
    
    // CSS 선택자 (중괄호 앞의 텍스트)
    html = html.replace(/^([.#\w\-\[\]=":~*,\s]+)(\s*\{)/gm, 
      '<span class="hl-selector">$1</span>$2');
    
    // CSS 속성명
    html = html.replace(/([\w-]+)(\s*:)/g, '<span class="hl-property">$1</span>$2');
    
    // CSS 값 (숫자 + 단위)
    html = html.replace(/:\s*([#\w\-.()\s,%]+)(;|$)/g, (match, value, end) => {
      // 색상값 #fff, #ffffff
      let highlighted = value.replace(/(#[0-9a-fA-F]{3,8})/g, '<span class="hl-color">$1</span>');
      // 숫자 + 단위
      highlighted = highlighted.replace(/(\d+(?:\.\d+)?)(px|em|rem|%|vh|vw|s|ms|deg)?/g, 
        '<span class="hl-number">$1</span><span class="hl-unit">$2</span>');
      // 키워드
      highlighted = highlighted.replace(/\b(none|auto|inherit|initial|unset|flex|block|inline|absolute|relative|fixed|center|left|right|top|bottom|solid|hidden|visible|pointer|normal|bold|nowrap|column|row|ease|linear)\b/g, 
        '<span class="hl-keyword">$1</span>');
      return ': ' + highlighted + end;
    });
    
    // 중괄호
    html = html.replace(/([{}])/g, '<span class="hl-brace">$1</span>');
    
    return html;
  }

  // 스크롤 동기화
  let textareaEl: HTMLTextAreaElement;
  let highlightEl: HTMLPreElement;
  let lineNumbersEl: HTMLDivElement;
  let codeAreaEl: HTMLDivElement;

  function syncScroll(e?: Event) {
    const scrollTop = textareaEl?.scrollTop || (e?.target as HTMLElement)?.scrollTop || 0;
    const scrollLeft = textareaEl?.scrollLeft || (e?.target as HTMLElement)?.scrollLeft || 0;
    
    if (highlightEl) {
      highlightEl.scrollTop = scrollTop;
      highlightEl.scrollLeft = scrollLeft;
    }
    if (lineNumbersEl) {
      lineNumbersEl.scrollTop = scrollTop;
    }
  }

  // 줄 번호 계산
  $: lineCount = (localData.backgroundEmbedding || '').split('\n').length;
  $: lineNumbers = Array.from({ length: Math.max(lineCount, 20) }, (_, i) => i + 1);

  // ========== 검색 기능 ==========
  let searchQuery = '';
  let searchVisible = false;
  let searchResults: { index: number; line: number; start: number; end: number }[] = [];
  let currentResultIndex = 0;

  $: if (searchQuery && localData.backgroundEmbedding) {
    searchResults = findAllMatches(localData.backgroundEmbedding, searchQuery);
    currentResultIndex = 0;
  } else {
    searchResults = [];
  }

  function findAllMatches(text: string, query: string): { index: number; line: number; start: number; end: number }[] {
    if (!query) return [];
    const results: { index: number; line: number; start: number; end: number }[] = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let pos = 0;
    let matchIndex = 0;
    
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      // 라인 번호 계산
      const lineNumber = text.substring(0, pos).split('\n').length;
      results.push({
        index: matchIndex++,
        line: lineNumber,
        start: pos,
        end: pos + query.length
      });
      pos += 1;
    }
    return results;
  }

  function toggleSearch() {
    searchVisible = !searchVisible;
    if (!searchVisible) {
      searchQuery = '';
    }
  }

  function goToResult(index: number) {
    if (searchResults.length === 0) return;
    currentResultIndex = ((index % searchResults.length) + searchResults.length) % searchResults.length;
    
    const result = searchResults[currentResultIndex];
    if (result && textareaEl) {
      // 해당 위치로 커서 이동
      textareaEl.focus();
      textareaEl.setSelectionRange(result.start, result.end);
      
      // 스크롤 위치 계산 (대략적인 라인 높이 기반)
      const lineHeight = 19.2; // font-size 0.8rem * line-height 1.6
      const targetScroll = (result.line - 5) * lineHeight;
      textareaEl.scrollTop = Math.max(0, targetScroll);
      syncScroll();
    }
  }

  function nextResult() {
    goToResult(currentResultIndex + 1);
  }

  function prevResult() {
    goToResult(currentResultIndex - 1);
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prevResult();
      else nextResult();
    } else if (e.key === 'Escape') {
      toggleSearch();
    }
  }

  // 검색어 하이라이트가 포함된 코드 하이라이팅
  function highlightCodeWithSearch(code: string): string {
    let html = highlightCode(code);
    
    if (searchQuery && searchResults.length > 0) {
      // 검색어를 하이라이트 (HTML 태그 내부는 제외)
      const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedQuery})`, 'gi');
      
      // 간단한 방식: 검색어에 하이라이트 클래스 추가
      html = html.replace(regex, '<mark class="search-highlight">$1</mark>');
    }
    
    return html;
  }
</script>

<div class="script-tab">
  <!-- 백그라운드 임베딩 -->
  <section class="script-section">
    <div class="section-header">
      <div class="header-left">
        <h3>🎨 백그라운드 임베딩</h3>
        <span class="section-hint">채팅창에 삽입되는 HTML/CSS 스타일</span>
      </div>
      <div class="header-actions">
        <button class="tool-btn" on:click={toggleSearch} title="검색 (Ctrl+F)" class:active={searchVisible}>
          🔍
        </button>
        <button class="format-btn" on:click={formatCode} title="코드 포맷팅">
          ✨ 정리
        </button>
      </div>
    </div>
    
    <!-- 검색 바 -->
    {#if searchVisible}
      <div class="search-bar">
        <input
          type="text"
          class="search-input"
          placeholder="검색어 입력..."
          bind:value={searchQuery}
          on:keydown={handleSearchKeydown}
        />
        <span class="search-count">
          {#if searchResults.length > 0}
            {currentResultIndex + 1} / {searchResults.length}
          {:else if searchQuery}
            0 / 0
          {/if}
        </span>
        <button class="search-nav-btn" on:click={prevResult} disabled={searchResults.length === 0}>▲</button>
        <button class="search-nav-btn" on:click={nextResult} disabled={searchResults.length === 0}>▼</button>
        <button class="search-close-btn" on:click={toggleSearch}>✕</button>
      </div>
    {/if}
    
    <div class="code-editor-container">
      <!-- 줄 번호 레이어 -->
      <div class="line-numbers" bind:this={lineNumbersEl}>
        {#each lineNumbers as num}
          <div class="line-number" class:highlight-line={searchResults.some(r => r.line === num)}>{num}</div>
        {/each}
      </div>
      <!-- 코드 영역 -->
      <div class="code-area" on:scroll={syncScroll}>
        <!-- 하이라이팅 레이어 (뒤) -->
        <pre 
          class="code-highlight" 
          bind:this={highlightEl}
          aria-hidden="true"
        >{@html highlightCodeWithSearch(localData.backgroundEmbedding)}</pre>
        <!-- 입력 레이어 (앞, 투명) -->
        <textarea
          class="code-editor"
          bind:this={textareaEl}
          value={localData.backgroundEmbedding}
          on:input={(e) => handleChange('backgroundEmbedding', e.currentTarget.value)}
          on:scroll={syncScroll}
          placeholder="&lt;style&gt;&#10;  .chattext .message &#123; ... &#125;&#10;&lt;/style&gt;"
          spellcheck="false"
        ></textarea>
      </div>
    </div>
  </section>
</div>

<style>
  .script-tab {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  .script-section {
    display: flex;
    flex-direction: column;
    background: var(--risu-theme-darkbg, #252525);
    border-radius: 8px;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--risu-theme-darkbg, #2a2a2a);
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .section-header h3 {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--risu-theme-textcolor, #fff);
  }

  .section-hint {
    font-size: 0.75rem;
    color: var(--risu-theme-textcolor2, #888);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .tool-btn {
    padding: 0.35rem 0.5rem;
    background: transparent;
    color: var(--risu-theme-textcolor2, #888);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .tool-btn:hover, .tool-btn.active {
    background: var(--risu-theme-primary, #4a9eff);
    color: white;
    border-color: var(--risu-theme-primary, #4a9eff);
  }

  .format-btn {
    padding: 0.35rem 0.75rem;
    background: var(--risu-theme-primary, #4a9eff);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .format-btn:hover {
    background: var(--risu-theme-primary-hover, #3a8eef);
  }

  /* 검색 바 */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--risu-theme-darkbg, #2a2a2a);
    border-bottom: 1px solid var(--risu-theme-borderc, #444);
  }

  .search-input {
    flex: 1;
    padding: 0.4rem 0.75rem;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    color: var(--risu-theme-textcolor, #fff);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--risu-theme-primary, #4a9eff);
  }

  .search-count {
    font-size: 0.75rem;
    color: var(--risu-theme-textcolor2, #888);
    min-width: 50px;
    text-align: center;
  }

  .search-nav-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--risu-theme-textcolor, #fff);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .search-nav-btn:hover:not(:disabled) {
    background: var(--risu-theme-primary, #4a9eff);
    border-color: var(--risu-theme-primary, #4a9eff);
  }

  .search-nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .search-close-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--risu-theme-textcolor2, #888);
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .search-close-btn:hover {
    color: var(--risu-theme-textcolor, #fff);
  }

  /* 코드 에디터 컨테이너 - 레이어 스택 */
  .code-editor-container {
    display: flex;
    position: relative;
    height: 400px;
    min-height: 200px;
    max-height: 90vh;
    resize: vertical;
    overflow: hidden;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 0 0 8px 8px;
  }

  /* 줄 번호 영역 */
  .line-numbers {
    flex-shrink: 0;
    width: 3rem;
    padding: 1rem 0.5rem;
    background: var(--risu-theme-darkbg, #252525);
    border-right: 1px solid var(--risu-theme-borderc, #444);
    text-align: right;
    user-select: none;
    overflow: hidden;
  }

  .line-number {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--risu-theme-textcolor2, #666);
  }

  /* 코드 영역 */
  .code-area {
    flex: 1;
    position: relative;
    overflow: auto;
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 0 0 8px 8px;
  }

  /* 하이라이팅 레이어 (뒤) */
  .code-highlight {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 1rem;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    color: #abb2bf;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.8rem;
    line-height: 1.6;
    tab-size: 2;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
    overflow: auto;
    pointer-events: none;
  }

  /* 입력 레이어 (앞, 투명) */
  .code-editor {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    padding: 1rem;
    background: transparent;
    color: transparent;
    caret-color: #fff;
    border: none;
    resize: none;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.8rem;
    line-height: 1.6;
    tab-size: 2;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
  }

  .code-editor:focus {
    outline: none;
  }

  .code-editor::placeholder {
    color: var(--risu-theme-textcolor2, #666);
  }

  /* 구문 강조 색상 - VS Code Dark+ 테마 기반 */
  :global(.hl-comment) {
    color: #6a9955;
    font-style: italic;
  }
  :global(.hl-tag) {
    color: #569cd6;
  }
  :global(.hl-selector) {
    color: #d7ba7d;
  }
  :global(.hl-property) {
    color: #9cdcfe;
  }
  :global(.hl-number) {
    color: #b5cea8;
  }
  :global(.hl-unit) {
    color: #b5cea8;
  }
  :global(.hl-color) {
    color: #ce9178;
  }
  :global(.hl-keyword) {
    color: #c586c0;
  }
  :global(.hl-brace) {
    color: #ffd700;
  }
  :global(.hl-string) {
    color: #ce9178;
  }

  /* 검색 하이라이트 */
  :global(.search-highlight) {
    background: rgba(255, 213, 0, 0.4);
    color: inherit;
    border-radius: 2px;
    padding: 0 2px;
  }

  /* 검색 결과가 있는 줄 번호 하이라이트 */
  .line-number.highlight-line {
    color: #ffd500;
    font-weight: bold;
  }
</style>
