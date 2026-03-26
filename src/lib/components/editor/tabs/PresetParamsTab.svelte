<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let data: any;

  const dispatch = createEventDispatcher();

  // 프리셋 데이터 추출
  $: preset = data?.preset || data || {};

  // 모델 파라미터 필드들
  $: paramFields = [
    { key: 'maxContext', label: 'Max Context', value: preset.maxContext ?? 4096, step: 100 },
    { key: 'maxResponse', label: 'Max Response', value: preset.maxResponse ?? 500, step: 10 },
    { key: 'temperature', label: 'Temperature', value: preset.temperature ?? 80, step: 1, hint: '0-200 (100 = 1.0)' },
    { key: 'top_p', label: 'Top P', value: preset.top_p ?? 1, step: 0.01, hint: '0-1' },
    { key: 'top_k', label: 'Top K', value: preset.top_k ?? 0, step: 1 },
    { key: 'min_p', label: 'Min P', value: preset.min_p ?? 0, step: 0.01 },
    { key: 'top_a', label: 'Top A', value: preset.top_a ?? 0, step: 0.01 },
    { key: 'frequencyPenalty', label: 'Frequency Penalty', value: preset.frequencyPenalty ?? 0, step: 0.1 },
    { key: 'PresensePenalty', label: 'Presence Penalty', value: preset.PresensePenalty ?? 0, step: 0.1 },
    { key: 'repetition_penalty', label: 'Repetition Penalty', value: preset.repetition_penalty ?? 1, step: 0.01 },
  ];

  function handleFieldChange(key: string, rawValue: string) {
    const value = parseFloat(rawValue) || 0;
    const newData = structuredClone(data);
    const target = newData.preset || newData;
    target[key] = value;
    dispatch('change', newData);
  }
</script>

<div class="preset-params-tab">
  <div class="params-grid">
    {#each paramFields as field}
      <div class="param-group">
        <label class="param-label" for={"preset-param-" + field.key}>
          {field.label}
          {#if field.hint}
            <span class="param-hint">{field.hint}</span>
          {/if}
        </label>
        <input
          id={"preset-param-" + field.key}
          type="number"
          class="param-input"
          value={field.value}
          step={field.step}
          on:change={(e) => handleFieldChange(field.key, e.currentTarget.value)}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .preset-params-tab {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    background: var(--risu-theme-bgcolor, #1a1a1a);
  }

  .params-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    max-width: 1200px;
  }

  .param-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--risu-theme-darkbg, #252525);
    border: 1px solid var(--risu-theme-borderc, #444);
    border-radius: 8px;
  }

  .param-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--risu-theme-textcolor2, #aaa);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .param-hint {
    font-size: 0.7rem;
    color: var(--risu-theme-textcolor2, #666);
    font-weight: 400;
  }

  .param-input {
    padding: 0.5rem 0.625rem;
    background: var(--risu-theme-bgcolor, #1a1a1a);
    border: 1px solid var(--risu-theme-borderc, #555);
    border-radius: 4px;
    color: var(--risu-theme-textcolor, #fff);
    font-size: 0.875rem;
    font-family: 'Consolas', monospace;
  }

  .param-input:focus {
    outline: none;
    border-color: var(--risu-theme-primary-600, #4682B4);
  }
</style>
