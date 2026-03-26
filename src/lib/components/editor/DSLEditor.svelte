<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
  import type { DecorationSet } from '@codemirror/view';
  import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

  export let value: string = '';
  export let mode: 'lorebook' | 'regex' | 'trigger' = 'lorebook';
  export let placeholder: string = '';
  export let searchQuery: string = '';  // 외부에서 전달받는 검색어

  const dispatch = createEventDispatcher();
  
  let containerRef: HTMLDivElement;
  let editorView: EditorView | null = null;
  let isInternalUpdate = false;
  
  // 검색 결과
  export let searchResultCount = 0;
  export let currentSearchIndex = 0;
  let searchMatches: { from: number; to: number; line: number }[] = [];

  // ModuleManager 색상 (createDarkTheme 참고)
  const RAINBOW_COLORS = ['#E06C75', '#E5C07B', '#61AFEF', '#C678DD', '#56B6C2'];

  // ModuleManager 스타일 다크 테마
  const darkTheme = EditorView.theme({
    '&': {
      fontSize: '13px',
      backgroundColor: '#141414',
      color: '#abb2bf',
      height: '100%'
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'Consolas', 'Monaco', monospace",
      backgroundColor: '#141414'
    },
    '.cm-content': {
      caretColor: '#fff',
      padding: '8px 0',
      backgroundColor: '#141414',
      color: '#abb2bf',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap'
    },
    '.cm-line': {
      color: '#abb2bf',
      wordBreak: 'break-word'
    },
    '.cm-cursor, .cm-cursor-primary': {
      borderLeftColor: '#fff !important'
    },
    '.cm-gutters': {
      backgroundColor: '#0f0f0f',
      borderRight: '1px solid #2a2a2a',
      color: '#555'
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#1a1a1a'
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)'
    },
    '.cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: '#3E4451 !important'
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: '#3E4451 !important'
    },
    '.cm-content ::selection': {
      backgroundColor: '#3E4451'
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: '#bad0f847',
      outline: '1px solid #515a6b'
    },
    '.cm-separator-line': {
      color: '#4A90D9',
      fontWeight: 'bold',
      textShadow: '0 0 8px rgba(74, 144, 217, 0.5)'
    },
    // 검색 하이라이트 스타일
    '.cm-searchMatch': {
      backgroundColor: 'rgba(255, 213, 0, 0.4)',
      borderRadius: '2px'
    },
    '.cm-searchMatch-current': {
      backgroundColor: 'rgba(255, 165, 0, 0.6)',
      borderRadius: '2px',
      outline: '1px solid #ffa500'
    }
  });

  // 검색 하이라이트용 StateEffect와 StateField
  const setSearchHighlights = StateEffect.define<{ from: number; to: number }[]>();
  
  const searchHighlightField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(highlights, tr) {
      for (const effect of tr.effects) {
        if (effect.is(setSearchHighlights)) {
          const builder = new RangeSetBuilder<Decoration>();
          const sorted = [...effect.value].sort((a, b) => a.from - b.from);
          for (const { from, to } of sorted) {
            builder.add(from, to, Decoration.mark({ class: 'cm-searchMatch' }));
          }
          return builder.finish();
        }
      }
      return highlights.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
  });

  // === 구분선 위젯
  class SeparatorWidget extends WidgetType {
    toDOM() {
      const span = document.createElement('span');
      span.className = 'cm-separator-line';
      span.textContent = '═══════════════════════════════════════════════════════════════════════════════════';
      return span;
    }
  }

  // CBS 정의 (ModuleManager와 동일)
  const CBS_DEFINITIONS = {
    displayRelatedCBS: ['raw', 'img', 'video', 'audio', 'bg', 'emotion', 'asset', 'video-img', 'comment', 'image', 'bgm', 'path', 'inlay', 'inlayed', 'inlayeddata', 'source'],
    nestedCBS: ['#if', '#if_pure', '#pure', '#each', '#func', '#pure_display', '#when', '#code', '#escape', '#puredisplay']
  };

  // CBS 타입 판별 (ModuleManager parseCBSHighlights 동일)
  function getCBSType(content: string): string {
    const lower = content.toLowerCase();
    if (lower.startsWith('// ') || lower.startsWith('//')) return 'comment';
    for (const nested of CBS_DEFINITIONS.nestedCBS) {
      if (lower.startsWith(nested.toLowerCase())) return 'normal';
    }
    for (const display of CBS_DEFINITIONS.displayRelatedCBS) {
      if (lower === display || lower.startsWith(display + '::')) return 'display';
    }
    return 'normal';
  }

  // CBS 하이라이트 파싱 (ModuleManager parseCBSHighlights와 동일한 로직)
  interface CBSHighlight {
    from: number;
    to: number;
    type: 'cbs-bracket' | 'cbs-content' | 'bracket';
    depth: number;
    cbsType?: string;
  }

  function parseCBSHighlights(text: string): CBSHighlight[] {
    const highlights: CBSHighlight[] = [];
    let pointer = 0;
    const stack: { type: string; char: string; pos: number; depth: number }[] = [];
    let cbsDepth = 0;
    const cbsStarts: number[] = [];

    while (pointer < text.length) {
      const c = text[pointer];
      const nextC = text[pointer + 1];
      const globalDepth = stack.length;

      // CBS 시작 {{
      if (c === '{' && nextC === '{') {
        highlights.push({
          from: pointer,
          to: pointer + 2,
          type: 'cbs-bracket',
          depth: globalDepth
        });
        stack.push({ type: 'cbs', char: '{{', pos: pointer, depth: globalDepth });
        cbsDepth++;
        cbsStarts[cbsDepth] = pointer + 2;
        pointer += 2;
        continue;
      }

      // CBS 끝 }}
      if (c === '}' && nextC === '}') {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].type === 'cbs') {
            // CBS 내용 강조
            if (cbsDepth > 0 && cbsStarts[cbsDepth] !== undefined) {
              const content = text.slice(cbsStarts[cbsDepth], pointer);
              const cbsType = getCBSType(content);
              highlights.push({
                from: cbsStarts[cbsDepth],
                to: pointer,
                type: 'cbs-content',
                depth: stack[i].depth,
                cbsType: cbsType
              });
            }
            // 닫는 괄호
            highlights.push({
              from: pointer,
              to: pointer + 2,
              type: 'cbs-bracket',
              depth: stack[i].depth
            });
            stack.splice(i, 1);
            cbsDepth--;
            break;
          }
        }
        pointer += 2;
        continue;
      }

      // 일반 괄호 (, ), [, ], {, }
      const OPEN_BRACKETS = new Set(['(', '[', '{']);
      const CLOSE_BRACKETS = new Set([')', ']', '}']);
      const BRACKET_PAIRS: { [key: string]: string } = { ')': '(', ']': '[', '}': '{' };

      if (OPEN_BRACKETS.has(c)) {
        highlights.push({
          from: pointer,
          to: pointer + 1,
          type: 'bracket',
          depth: globalDepth
        });
        stack.push({ type: 'bracket', char: c, pos: pointer, depth: globalDepth });
        pointer++;
        continue;
      }

      if (CLOSE_BRACKETS.has(c)) {
        const expectedOpen = BRACKET_PAIRS[c];
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].type === 'bracket' && stack[i].char === expectedOpen) {
            highlights.push({
              from: pointer,
              to: pointer + 1,
              type: 'bracket',
              depth: stack[i].depth
            });
            stack.splice(i, 1);
            break;
          }
        }
        pointer++;
        continue;
      }

      pointer++;
    }

    return highlights;
  }

  // CBS 구문 강조 플러그인
  const cbsPlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: any) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView): DecorationSet {
      const decorations: { from: number; to: number; decoration: Decoration }[] = [];
      const text = view.state.doc.toString();
      
      // === 구분선 처리
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          if (line.text.trim() === '===') {
            decorations.push({
              from: line.from,
              to: line.to,
              decoration: Decoration.replace({
                widget: new SeparatorWidget()
              })
            });
          }
          pos = line.to + 1;
        }
      }

      // CBS 하이라이트 (ModuleManager parseCBSHighlights 사용)
      const cbsHighlights = parseCBSHighlights(text);
      for (const h of cbsHighlights) {
        if (h.from >= h.to || h.from >= text.length || h.to > text.length) continue;

        let style = '';
        
        if (h.type === 'bracket' || h.type === 'cbs-bracket') {
          // 괄호: 무지개 색상 + bold
          const color = RAINBOW_COLORS[h.depth % RAINBOW_COLORS.length];
          style = `color: ${color}; font-weight: bold;`;
        } else if (h.type === 'cbs-content') {
          // CBS 내용: display면 노랑, 아니면 무지개 색상
          if (h.cbsType === 'display') {
            style = `color: #E5C07B;`; // display 타입은 노랑
          } else if (h.cbsType === 'comment') {
            style = `color: #5C6370; font-style: italic;`; // 주석
          } else {
            const color = RAINBOW_COLORS[h.depth % RAINBOW_COLORS.length];
            style = `color: ${color};`;
          }
        }

        if (style) {
          decorations.push({
            from: h.from,
            to: h.to,
            decoration: Decoration.mark({
              attributes: { style }
            })
          });
        }
      }

      // 정렬 후 DecorationSet 생성
      decorations.sort((a, b) => a.from - b.from || a.to - b.to);
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to, decoration } of decorations) {
        if (from < to) {
          builder.add(from, to, decoration);
        }
      }
      return builder.finish();
    }
  }, {
    decorations: v => v.decorations
  });

  onMount(() => {
    if (!containerRef) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isInternalUpdate) {
        const newValue = update.state.doc.toString();
        if (newValue !== value) {
          value = newValue;
          dispatch('change', { value: newValue });
        }
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        // drawSelection(), // 브라우저 기본 선택 사용
        keymap.of([...defaultKeymap, ...historyKeymap]),
        darkTheme,
        cbsPlugin,
        searchHighlightField,  // 검색 하이라이트
        updateListener,
        EditorView.lineWrapping
      ]
    });

    editorView = new EditorView({
      state,
      parent: containerRef
    });
  });

  onDestroy(() => {
    editorView?.destroy();
  });

  // 외부에서 value가 변경되면 에디터 업데이트
  $: if (editorView && value !== editorView.state.doc.toString()) {
    isInternalUpdate = true;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: value }
    });
    isInternalUpdate = false;
  }

  // 검색어 변경 시 매칭 업데이트 및 하이라이트
  $: if (editorView && searchQuery !== undefined) {
    updateSearchHighlights(searchQuery);
  }

  function updateSearchHighlights(query: string) {
    if (!editorView) return;
    
    searchMatches = [];
    if (!query) {
      searchResultCount = 0;
      currentSearchIndex = 0;
      // 하이라이트 제거
      editorView.dispatch({
        effects: setSearchHighlights.of([])
      });
      return;
    }
    
    const text = editorView.state.doc.toString();
    const lowerQuery = query.toLowerCase();
    const lowerText = text.toLowerCase();
    let pos = 0;
    
    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      const line = editorView.state.doc.lineAt(pos);
      searchMatches.push({
        from: pos,
        to: pos + query.length,
        line: line.number
      });
      pos += 1;
    }
    
    searchResultCount = searchMatches.length;
    currentSearchIndex = searchMatches.length > 0 ? 0 : -1;
    
    // 하이라이트 적용
    editorView.dispatch({
      effects: setSearchHighlights.of(searchMatches.map(m => ({ from: m.from, to: m.to })))
    });
    
    // 첫 번째 결과로 스크롤
    if (searchMatches.length > 0) {
      goToSearchResult(0);
    }
  }

  export function goToSearchResult(index: number) {
    if (!editorView || searchMatches.length === 0) return;
    currentSearchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
    const match = searchMatches[currentSearchIndex];
    
    editorView.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: 'center' })
    });
  }

  export function nextSearchResult() {
    goToSearchResult(currentSearchIndex + 1);
  }

  export function prevSearchResult() {
    goToSearchResult(currentSearchIndex - 1);
  }

  export function scrollToLine(lineNumber: number) {
    if (!editorView) return;
    const line = editorView.state.doc.line(Math.min(lineNumber, editorView.state.doc.lines));
    editorView.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: 'center' })
    });
  }

  export function focus() {
    editorView?.focus();
  }
</script>

<div
  class="dsl-editor"
  data-mode={mode}
  aria-label={placeholder || 'DSL editor'}
  bind:this={containerRef}
></div>

<style>
  .dsl-editor {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .dsl-editor :global(.cm-editor) {
    height: 100%;
  }
</style>
