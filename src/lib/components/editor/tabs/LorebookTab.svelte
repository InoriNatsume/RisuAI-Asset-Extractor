<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import DSLEditor from '../DSLEditor.svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  $: lorebook = getLorebook(data);
  
  let selectedIndex = -1;
  let selectedFolderId: string | null = null;  // 폴더 단위 선택
  let viewMode: 'dsl' | 'raw' = 'dsl';
  let dslText = '';
  let searchTerm = '';
  let dslEditor: DSLEditor;
  let expandedFolders = new Set<string>();
  let displayMode: 'all' | 'single' | 'folder' = 'all';  // 전체 / 개별 / 폴더 단위
  let initialized = false;  // 초기화 플래그
  
  // 코드 에디터 내 검색
  let codeSearchQuery = '';
  let codeSearchVisible = false;
  let codeSearchResultCount = 0;
  let codeSearchCurrentIndex = 0;
  
  // 폴더는 기본적으로 접힌 상태 (초기화는 한 번만)
  $: if (lorebook.length > 0 && !initialized) {
    expandedFolders = new Set<string>();  // 모두 접힘
    initialized = true;
  }

  // 폴더 구조로 그룹화
  $: groupedLorebook = groupByFolders(lorebook);
  
  // 폴더 정보 추출
  $: folders = lorebook.filter(e => e.mode === 'folder');
  
  $: filteredList = lorebook.filter(entry => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      entry.comment?.toLowerCase().includes(term) ||
      entry.key?.toLowerCase().includes(term) ||
      entry.content?.toLowerCase().includes(term)
    );
  });

  // DSL 텍스트: 선택 상태에 따라 전체 / 개별 / 폴더 단위 표시
  $: {
    const _mode = displayMode;
    const _idx = selectedIndex;
    const _folderId = selectedFolderId;
    const _list = lorebook;
    const _grouped = groupedLorebook;
    
    if (_mode === 'single' && _idx >= 0 && _idx < _list.length) {
      // 개별 항목
      dslText = lorebookToDSL([_list[_idx]]);
      console.log('[LorebookTab] Single mode - showing entry:', _idx, _list[_idx]?.comment);
    } else if (_mode === 'folder' && _folderId) {
      // 폴더 단위 - 해당 폴더 내 모든 항목
      const folder = _grouped.find(g => g.id === _folderId);
      if (folder) {
        const entries = folder.entries.map(e => e.entry);
        dslText = lorebookToDSL(entries);
        console.log('[LorebookTab] Folder mode - showing folder:', folder.name, 'with', entries.length, 'entries');
      } else {
        dslText = lorebookToDSL(_list);
      }
    } else {
      dslText = lorebookToDSL(_list);
    }
  }

  function getLorebook(data: any): any[] {
    if (!data) return [];
    if (data.module?.lorebook) return data.module.lorebook;
    if (data.lorebook) return data.lorebook;
    return [];
  }

  interface FolderGroup {
    id: string | null;
    name: string;
    entries: { entry: any; originalIndex: number }[];
  }

  function groupByFolders(entries: any[]): FolderGroup[] {
    const groups: FolderGroup[] = [];
    const folderMap = new Map<string, FolderGroup>();
    
    console.log('[LorebookTab] groupByFolders 호출, 총 항목:', entries.length);
    
    // 1. 폴더 추출 (mode === 'folder')
    entries.forEach((entry, idx) => {
      if (entry.mode === 'folder') {
        // 폴더 ID: entry.id 우선, 없으면 key에서 추출
        let folderId = entry.id;
        if (!folderId && entry.key) {
          const match = entry.key.match(/\uf000folder:(.+)/);
          if (match) folderId = match[1];
        }
        if (!folderId) folderId = `folder-${idx}`;
        
        console.log('[LorebookTab] 폴더 발견:', { folderId, name: entry.comment });
        
        folderMap.set(folderId, {
          id: folderId,
          name: entry.comment || '폴더',
          entries: []
        });
      }
    });
    
    console.log('[LorebookTab] 발견된 폴더 수:', folderMap.size, 'IDs:', [...folderMap.keys()]);
    
    // 2. 루트 그룹 (폴더에 속하지 않은 항목)
    const rootGroup: FolderGroup = { id: null, name: '(루트)', entries: [] };
    
    // 3. 항목 분류
    entries.forEach((entry, idx) => {
      if (entry.mode === 'folder') return; // 폴더 자체는 제외
      
      let parentFolder = entry.folder;
      
      // \uf000folder:UUID 형식에서 UUID만 추출
      if (parentFolder && parentFolder.includes('folder:')) {
        const match = parentFolder.match(/folder:(.+)/);
        if (match) parentFolder = match[1];
      }
      
      if (parentFolder && folderMap.has(parentFolder)) {
        folderMap.get(parentFolder)!.entries.push({ entry, originalIndex: idx });
      } else {
        // 폴더가 지정됐지만 찾을 수 없는 경우 디버그
        if (entry.folder) {
          console.log('[LorebookTab] 폴더 매칭 실패:', { entryName: entry.comment, originalFolder: entry.folder, extractedId: parentFolder, availableFolders: [...folderMap.keys()] });
        }
        rootGroup.entries.push({ entry, originalIndex: idx });
      }
    });
    
    // 4. 폴더 먼저, 그다음 루트
    folderMap.forEach(folder => {
      groups.push(folder);
    });
    if (rootGroup.entries.length > 0) {
      groups.push(rootGroup);
    }
    
    console.log('[LorebookTab] 최종 그룹:', groups.map(g => ({ name: g.name, count: g.entries.length })));
    
    return groups;
  }

  function toggleFolder(folderId: string | null) {
    if (folderId === null) return;
    if (expandedFolders.has(folderId)) {
      expandedFolders.delete(folderId);
    } else {
      expandedFolders.add(folderId);
    }
    expandedFolders = new Set(expandedFolders);
  }

  function lorebookToDSL(entries: any[]): string {
    return entries.map(entry => {
      const lines: string[] = [];
      lines.push('===');
      if (entry.comment) lines.push(`name = "${escapeQuotes(entry.comment)}"`);
      if (entry.key) lines.push(`key = "${escapeQuotes(entry.key)}"`);
      if (entry.priority !== undefined) lines.push(`priority = "${entry.priority}"`);
      if (entry.insertorder !== undefined) lines.push(`insertOrder = "${entry.insertorder}"`);
      if (entry.alwaysActive) lines.push(`alwaysActive = "true"`);
      if (entry.useRegex) lines.push(`useRegex = "true"`);
      if (entry.content) {
        if (entry.content.includes('\n')) {
          lines.push(`content = '''`);
          lines.push(entry.content);
          lines.push(`'''`);
        } else {
          lines.push(`content = "${escapeQuotes(entry.content)}"`);
        }
      }
      return lines.join('\n');
    }).join('\n\n');
  }

  function dslToLorebook(dsl: string): any[] {
    const entries: any[] = [];
    const blocks = dsl.split(/^===$/m).filter(b => b.trim());
    
    for (const block of blocks) {
      const entry: any = {
        comment: '',
        key: '',
        content: '',
        priority: 0,
        insertorder: 0,
        alwaysActive: false,
        useRegex: false
      };
      
      // 멀티라인 content
      const contentMatch = block.match(/content\s*=\s*'''([\s\S]*?)'''/);
      if (contentMatch) entry.content = contentMatch[1].trim();
      
      const lines = block.replace(/content\s*=\s*'''[\s\S]*?'''/g, '').split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\w+)\s*=\s*(.+)$/);
        if (!match) continue;
        
        const [, key, rawValue] = match;
        let value = rawValue.trim();
        
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        
        switch (key) {
          case 'name': case 'comment': entry.comment = value; break;
          case 'key': entry.key = value; break;
          case 'priority': entry.priority = parseInt(value) || 0; break;
          case 'insertOrder': case 'insertorder': entry.insertorder = parseInt(value) || 0; break;
          case 'alwaysActive': entry.alwaysActive = value === 'true'; break;
          case 'useRegex': entry.useRegex = value === 'true'; break;
          case 'content': if (!entry.content) entry.content = value; break;
        }
      }
      
      if (entry.comment || entry.key || entry.content) entries.push(entry);
    }
    
    return entries;
  }

  function escapeQuotes(str: string): string {
    return str.replace(/"/g, '\\"');
  }

  function selectEntry(index: number) {
    if (selectedIndex === index && displayMode === 'single') {
      // 같은 항목 다시 클릭 시 선택 해제
      selectedIndex = -1;
      selectedFolderId = null;
      displayMode = 'all';
    } else {
      selectedIndex = index;
      selectedFolderId = null;
      displayMode = 'single';  // 개별 보기 모드로 전환
    }
  }

  function selectFolder(folderId: string | null, folderName: string) {
    if (folderId === null) return;  // 루트는 선택 불가
    
    if (selectedFolderId === folderId && displayMode === 'folder') {
      // 같은 폴더 다시 클릭 시 선택 해제
      selectedFolderId = null;
      selectedIndex = -1;
      displayMode = 'all';
    } else {
      selectedFolderId = folderId;
      selectedIndex = -1;
      displayMode = 'folder';
    }
  }

  function showAll() {
    selectedIndex = -1;
    selectedFolderId = null;
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
    const newList = [...lorebook, {
      comment: '새 로어북',
      key: '',
      content: '',
      priority: 0,
      insertorder: 0,
      alwaysActive: false,
      useRegex: false
    }];
    updateLorebook(newList);
    selectedIndex = newList.length - 1;
  }

  function deleteEntry(index: number) {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    const newList = lorebook.filter((_, i) => i !== index);
    updateLorebook(newList);
    if (selectedIndex === index) selectedIndex = -1;
    else if (selectedIndex > index) selectedIndex--;
  }

  function handleDSLChange(event: CustomEvent<{ value: string }>) {
    dslText = event.detail.value;
  }

  function applyDSL() {
    try {
      const parsed = dslToLorebook(dslText);
      
      if (displayMode === 'single' && selectedIndex >= 0 && parsed.length === 1) {
        // 개별 모드: 선택된 항목만 업데이트
        const newList = [...lorebook];
        newList[selectedIndex] = parsed[0];
        updateLorebook(newList);
      } else if (displayMode === 'folder' && selectedFolderId) {
        // 폴더 모드: 해당 폴더 내 항목들만 업데이트
        const folder = groupedLorebook.find(g => g.id === selectedFolderId);
        if (folder) {
          const newList = [...lorebook];
          // 폴더 내 항목들의 인덱스 가져오기
          const indices = folder.entries.map(e => e.originalIndex).sort((a, b) => b - a);
          // 역순으로 삭제 후 새 항목 삽입
          for (const idx of indices) {
            newList.splice(idx, 1);
          }
          // 첫 위치에 새 항목들 삽입
          const insertIdx = Math.min(...folder.entries.map(e => e.originalIndex));
          newList.splice(insertIdx, 0, ...parsed);
          updateLorebook(newList);
        }
      } else {
        // 전체 모드: 전체 목록 교체
        updateLorebook(parsed);
      }
    } catch (e) {
      console.error('DSL 파싱 오류:', e);
      alert('DSL 파싱 오류');
    }
  }

  function updateLorebook(newList: any[]) {
    const newData = structuredClone(data);
    if (newData.module) newData.module.lorebook = newList;
    else newData.lorebook = newList;
    dispatch('change', newData);
  }

  function copyToClipboard() { navigator.clipboard.writeText(dslText); }

  async function pasteFromClipboard() {
    try { dslText = await navigator.clipboard.readText(); } catch {}
  }
</script>

<div class="lorebook-tab">
  <!-- 메인: DSL 코드 에디터 -->
  <main class="editor-panel">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <button class="mode-btn" class:active={viewMode === 'dsl'} on:click={() => viewMode = 'dsl'}>DSL</button>
        <button class="mode-btn" class:active={viewMode === 'raw'} on:click={() => viewMode = 'raw'}>Raw</button>
        <span class="separator">|</span>
        {#if displayMode === 'single' && selectedIndex >= 0}
          <button class="mode-btn active-item" on:click={showAll}>
            📄 {lorebook[selectedIndex]?.comment || '선택됨'} ×
          </button>
        {:else if displayMode === 'folder' && selectedFolderId}
          {@const folder = groupedLorebook.find(g => g.id === selectedFolderId)}
          <button class="mode-btn active-item folder-item" on:click={showAll}>
            📂 {folder?.name || '폴더'} ({folder?.entries.length || 0}개) ×
          </button>
        {:else}
          <span class="view-label">전체 {lorebook.length}개</span>
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
          mode="lorebook"
          searchQuery={codeSearchQuery}
          bind:searchResultCount={codeSearchResultCount}
          bind:currentSearchIndex={codeSearchCurrentIndex}
          placeholder={'===\nname = "로어북 이름"\nkey = "키워드1, 키워드2"\npriority = "100"\ncontent = \'\'\'\n로어북 내용\n\'\'\''}
          on:change={handleDSLChange}
        />
      {:else}
        <textarea
          class="code-editor raw-editor"
          value={JSON.stringify(lorebook, null, 2)}
          on:input={(e) => { try { updateLorebook(JSON.parse(e.currentTarget.value)); } catch {} }}
          spellcheck="false"
        ></textarea>
      {/if}
    </div>
  </main>

  <!-- 우측: 북마크 패널 -->
  <aside class="bookmark-panel">
    <div class="panel-header">
      <input type="text" placeholder="🔍 검색..." bind:value={searchTerm} class="search-input" />
    </div>
    
    <ul class="entry-list">
      {#if searchTerm}
        <!-- 검색 모드: 플랫 리스트 -->
        {#each filteredList as entry, i}
          {@const originalIndex = lorebook.indexOf(entry)}
          <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
          <li
            class="entry-item"
            class:selected={selectedIndex === originalIndex}
            class:always-active={entry.alwaysActive}
            on:click={() => selectEntry(originalIndex)}
            on:keydown={(e) => e.key === 'Enter' && selectEntry(originalIndex)}
          >
            <div class="entry-info">
              <span class="entry-name">{entry.comment || entry.key || '(이름 없음)'}</span>
              <span class="entry-key">{entry.key?.slice(0, 30) || ''}</span>
            </div>
            <button class="btn-delete" on:click|stopPropagation={() => deleteEntry(originalIndex)} title="삭제">×</button>
          </li>
        {/each}
      {:else}
        <!-- 폴더 모드: 그룹화된 리스트 -->
        {#each groupedLorebook as group}
          {#if group.id !== null}
            <!-- 폴더 헤더 -->
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <li
              class="folder-header"
              class:expanded={expandedFolders.has(group.id)}
              class:folder-selected={selectedFolderId === group.id && displayMode === 'folder'}
            >
              <button 
                class="folder-toggle" 
                on:click|stopPropagation={() => toggleFolder(group.id)}
                title={expandedFolders.has(group.id) ? '접기' : '펼치기'}
              >
                {expandedFolders.has(group.id) ? '▼' : '▶'}
              </button>
              <button 
                class="folder-select"
                on:click|stopPropagation={() => selectFolder(group.id, group.name)}
                title="이 폴더만 보기"
              >
                <span class="folder-icon">{expandedFolders.has(group.id) ? '📂' : '📁'}</span>
                <span class="folder-name">{group.name}</span>
                <span class="folder-count">({group.entries.length})</span>
              </button>
            </li>
          {/if}
          
          <!-- 폴더 내 항목들 (루트거나 확장된 폴더일 때만 표시) -->
          {#if group.id === null || expandedFolders.has(group.id)}
            {#each group.entries as { entry, originalIndex }}
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <li
                class="entry-item"
                class:nested={group.id !== null}
                class:selected={selectedIndex === originalIndex}
                class:always-active={entry.alwaysActive}
                on:click={() => selectEntry(originalIndex)}
                on:keydown={(e) => e.key === 'Enter' && selectEntry(originalIndex)}
              >
                <div class="entry-info">
                  <span class="entry-name">{entry.comment || entry.key || '(이름 없음)'}</span>
                  <span class="entry-key">{entry.key?.slice(0, 30) || ''}</span>
                </div>
                <button class="btn-delete" on:click|stopPropagation={() => deleteEntry(originalIndex)} title="삭제">×</button>
              </li>
            {/each}
          {/if}
        {/each}
      {/if}
      
      {#if filteredList.length === 0 && searchTerm}
        <li class="empty-message">검색 결과 없음</li>
      {:else if lorebook.length === 0}
        <li class="empty-message">로어북이 없습니다</li>
      {/if}
    </ul>
    
    <div class="panel-footer">
      <button class="btn-add" on:click={addEntry}>+ 추가</button>
      <span class="count">총 {lorebook.length}개 {folders.length > 0 ? `(${folders.length}폴더)` : ''}</span>
    </div>
  </aside>
</div>

<style>
  .lorebook-tab {
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

  .entry-item.always-active {
    border-left: 3px solid #7ee787;
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

  .entry-key {
    font-size: 0.6875rem;
    color: var(--risu-theme-textcolor2, #888);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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

  /* 폴더 스타일 */
  .folder-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 4px 6px;
    transition: all 0.15s;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 6px;
    font-size: 0.8125rem;
  }

  .folder-header:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .folder-header.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-bottom-color: transparent;
  }

  .folder-header.folder-selected {
    background: rgba(70, 130, 180, 0.2);
    border-color: var(--risu-theme-primary-600, #4682B4);
  }

  .folder-toggle {
    background: none;
    border: none;
    color: var(--risu-theme-textcolor2, #888);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 0.625rem;
  }

  .folder-toggle:hover {
    color: var(--risu-theme-textcolor, #fff);
  }

  .folder-select {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    text-align: left;
  }

  .folder-select:hover .folder-name {
    color: var(--risu-theme-primary-600, #4682B4);
  }

  .folder-icon {
    font-size: 1rem;
  }

  .folder-name {
    flex: 1;
    color: var(--risu-theme-textcolor, #fff);
    font-weight: 500;
  }

  .folder-count {
    color: var(--risu-theme-textcolor2, #888);
    font-size: 0.6875rem;
  }

  .folder-item {
    background: #2d5a7b !important;
  }

  /* 폴더 내 중첩된 항목 */
  .entry-item.nested {
    margin-left: 1rem;
    border-left: 2px solid var(--risu-theme-borderc, #444);
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
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
