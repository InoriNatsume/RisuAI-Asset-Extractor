/**
 * Risu Asset Extractor validation module
 * ModuleManager의 검증 로직을 참고하여 구현
 * 
 * 지원하는 검증:
 * - 모듈(.risum) 구조 검증
 * - 캐릭터(.charx) 구조 검증  
 * - 프리셋(.risup) 구조 검증
 * - 중복 ID 체크
 * - 필수 필드 체크
 * - 배열 타입 체크
 */

export type ValidationLevel = 'error' | 'warning';

export interface ValidationError {
  level: ValidationLevel;
  path: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
  all: ValidationError[];
  isValid: boolean;
  summary: {
    errorCount: number;
    warningCount: number;
  };
}

/**
 * 모듈(.risum) 데이터 검증
 */
export function validateModule(module: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!module || typeof module !== 'object') {
    errors.push({
      level: 'error',
      path: 'module',
      message: '모듈 데이터가 없거나 객체가 아닙니다'
    });
    return createResult(errors, warnings);
  }

  // 필수 필드 체크
  if (typeof module.name !== 'string') {
    warnings.push({
      level: 'warning',
      path: 'name',
      message: 'name 필드가 없거나 문자열이 아닙니다'
    });
  }

  // lorebook 배열 검증
  if (module.lorebook !== undefined) {
    validateArraySection(module.lorebook, 'lorebook', errors, warnings);
  }

  // regex 배열 검증
  if (module.regex !== undefined) {
    validateArraySection(module.regex, 'regex', errors, warnings);
  }

  // trigger 배열 검증
  if (module.trigger !== undefined) {
    validateTriggerSection(module.trigger, errors, warnings);
  }

  // assets 배열 검증
  if (module.assets !== undefined) {
    validateAssets(module.assets, errors, warnings);
  }

  return createResult(errors, warnings);
}

/**
 * 캐릭터(.charx) 데이터 검증
 */
export function validateCharacter(char: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!char || typeof char !== 'object') {
    errors.push({
      level: 'error',
      path: 'character',
      message: '캐릭터 데이터가 없거나 객체가 아닙니다'
    });
    return createResult(errors, warnings);
  }

  // spec 버전 체크
  if (char.spec !== 'chara_card_v3') {
    warnings.push({
      level: 'warning',
      path: 'spec',
      message: `spec이 "chara_card_v3"이 아닙니다: ${char.spec || '없음'}`
    });
  }

  // 필수 필드 체크
  if (typeof char.name !== 'string' || !char.name) {
    errors.push({
      level: 'error',
      path: 'name',
      message: '캐릭터 이름(name)이 필요합니다'
    });
  }

  // data 객체 체크
  if (char.data) {
    const data = char.data;

    // extensions 체크
    if (data.extensions?.risuai) {
      const risuai = data.extensions.risuai;

      // lorebook 검증
      if (risuai.additionalAssets !== undefined) {
        if (!Array.isArray(risuai.additionalAssets)) {
          errors.push({
            level: 'error',
            path: 'data.extensions.risuai.additionalAssets',
            message: 'additionalAssets가 배열이 아닙니다'
          });
        } else {
          risuai.additionalAssets.forEach((asset: any, idx: number) => {
            if (!Array.isArray(asset)) {
              errors.push({
                level: 'error',
                path: `data.extensions.risuai.additionalAssets[${idx}]`,
                message: '에셋이 [id, path, ext] 배열 형태가 아닙니다'
              });
            }
          });
        }
      }

      // regex 검증
      if (risuai.regex !== undefined) {
        validateArraySection(risuai.regex, 'data.extensions.risuai.regex', errors, warnings);
      }

      // trigger 검증
      if (risuai.trigger !== undefined) {
        validateTriggerSection(risuai.trigger, errors, warnings, 'data.extensions.risuai.trigger');
      }
    }

    // character_book (lorebook) 검증
    if (data.character_book?.entries) {
      if (!Array.isArray(data.character_book.entries)) {
        errors.push({
          level: 'error',
          path: 'data.character_book.entries',
          message: 'lorebook entries가 배열이 아닙니다'
        });
      } else {
        validateLorebookEntries(data.character_book.entries, 'data.character_book.entries', errors, warnings);
      }
    }
  }

  return createResult(errors, warnings);
}

/**
 * 프리셋(.risup) 데이터 검증
 */
export function validatePreset(preset: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!preset || typeof preset !== 'object') {
    errors.push({
      level: 'error',
      path: 'preset',
      message: '프리셋 데이터가 없거나 객체가 아닙니다'
    });
    return createResult(errors, warnings);
  }

  // 필수 필드 체크
  if (typeof preset.name !== 'string') {
    warnings.push({
      level: 'warning',
      path: 'name',
      message: 'name 필드가 없거나 문자열이 아닙니다'
    });
  }

  // promptTemplate 체크
  if (preset.promptTemplate !== undefined) {
    if (!Array.isArray(preset.promptTemplate)) {
      errors.push({
        level: 'error',
        path: 'promptTemplate',
        message: 'promptTemplate이 배열이 아닙니다'
      });
    }
  }

  // maxContext 체크
  if (preset.maxContext !== undefined && typeof preset.maxContext !== 'number') {
    errors.push({
      level: 'error',
      path: 'maxContext',
      message: 'maxContext가 숫자가 아닙니다'
    });
  }

  // maxResponse 체크
  if (preset.maxResponse !== undefined && typeof preset.maxResponse !== 'number') {
    errors.push({
      level: 'error',
      path: 'maxResponse',
      message: 'maxResponse가 숫자가 아닙니다'
    });
  }

  return createResult(errors, warnings);
}

/**
 * 배열 섹션 검증 (lorebook, regex)
 */
function validateArraySection(
  arr: any,
  sectionName: string,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!Array.isArray(arr)) {
    errors.push({
      level: 'error',
      path: sectionName,
      message: `${sectionName}이(가) 배열이 아닙니다 (데이터 손상)`
    });
    return;
  }

  const seenIds = new Set<string>();

  arr.forEach((item: any, idx: number) => {
    if (!item || typeof item !== 'object') {
      errors.push({
        level: 'error',
        path: `${sectionName}[${idx}]`,
        message: '항목이 객체가 아닙니다 (데이터 손상)'
      });
      return;
    }

    // 중복 ID 체크
    const id = item._id || item.id;
    if (id) {
      if (seenIds.has(id)) {
        errors.push({
          level: 'error',
          path: `${sectionName}[${idx}]`,
          message: `중복 ID "${id}" - 동일한 ID가 이미 존재합니다`
        });
      }
      seenIds.add(id);
    }
  });
}

/**
 * 트리거 섹션 검증
 */
function validateTriggerSection(
  arr: any,
  errors: ValidationError[],
  warnings: ValidationError[],
  basePath: string = 'trigger'
): void {
  if (!Array.isArray(arr)) {
    errors.push({
      level: 'error',
      path: basePath,
      message: 'trigger가 배열이 아닙니다 (데이터 손상)'
    });
    return;
  }

  const seenIds = new Set<string>();

  arr.forEach((item: any, idx: number) => {
    if (!item || typeof item !== 'object') {
      errors.push({
        level: 'error',
        path: `${basePath}[${idx}]`,
        message: '항목이 객체가 아닙니다 (데이터 손상)'
      });
      return;
    }

    // 중복 ID 체크
    const id = item._id || item.id;
    if (id) {
      if (seenIds.has(id)) {
        errors.push({
          level: 'error',
          path: `${basePath}[${idx}]`,
          message: `중복 ID "${id}" - 동일한 ID가 이미 존재합니다`
        });
      }
      seenIds.add(id);
    }

    // effect 배열 체크
    if (item.effect !== undefined && !Array.isArray(item.effect)) {
      errors.push({
        level: 'error',
        path: `${basePath}[${idx}].effect`,
        message: 'effect가 배열이 아닙니다 (데이터 손상)'
      });
    }

    // conditions 배열 체크
    if (item.conditions !== undefined && !Array.isArray(item.conditions)) {
      errors.push({
        level: 'error',
        path: `${basePath}[${idx}].conditions`,
        message: 'conditions가 배열이 아닙니다 (데이터 손상)'
      });
    }
  });
}

/**
 * 에셋 배열 검증
 */
function validateAssets(
  arr: any,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!Array.isArray(arr)) {
    errors.push({
      level: 'error',
      path: 'assets',
      message: 'assets가 배열이 아닙니다 (데이터 손상)'
    });
    return;
  }

  arr.forEach((item: any, idx: number) => {
    if (!Array.isArray(item)) {
      errors.push({
        level: 'error',
        path: `assets[${idx}]`,
        message: '항목이 배열이 아닙니다 - [id, path, ext] 형태여야 함'
      });
    } else if (item.length < 3) {
      warnings.push({
        level: 'warning',
        path: `assets[${idx}]`,
        message: '에셋 배열 요소가 부족합니다 - [id, path, ext] 형태 권장'
      });
    }
  });
}

/**
 * 로어북 엔트리 검증
 */
function validateLorebookEntries(
  entries: any[],
  basePath: string,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  const seenIds = new Set<string>();

  entries.forEach((entry: any, idx: number) => {
    if (!entry || typeof entry !== 'object') {
      errors.push({
        level: 'error',
        path: `${basePath}[${idx}]`,
        message: '엔트리가 객체가 아닙니다'
      });
      return;
    }

    // 중복 ID 체크
    const id = entry.id;
    if (id !== undefined) {
      const idStr = String(id);
      if (seenIds.has(idStr)) {
        errors.push({
          level: 'error',
          path: `${basePath}[${idx}]`,
          message: `중복 ID "${id}" - 동일한 ID가 이미 존재합니다`
        });
      }
      seenIds.add(idStr);
    }

    // keys 배열 체크
    if (entry.keys !== undefined && !Array.isArray(entry.keys)) {
      errors.push({
        level: 'error',
        path: `${basePath}[${idx}].keys`,
        message: 'keys가 배열이 아닙니다'
      });
    }

    // secondary_keys 배열 체크
    if (entry.secondary_keys !== undefined && !Array.isArray(entry.secondary_keys)) {
      errors.push({
        level: 'error',
        path: `${basePath}[${idx}].secondary_keys`,
        message: 'secondary_keys가 배열이 아닙니다'
      });
    }
  });
}

/**
 * 검증 결과 생성
 */
function createResult(
  errors: ValidationError[],
  warnings: ValidationError[]
): ValidationResult {
  const all = [...errors, ...warnings];
  return {
    errors,
    warnings,
    all,
    isValid: errors.length === 0,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length
    }
  };
}

/**
 * 검증 결과를 HTML로 포맷팅 (UI 표시용)
 */
export function formatValidationResultHTML(result: ValidationResult): string {
  if (result.all.length === 0) {
    return '<div class="validation-success">✅ 검증 성공 - 오류 없음</div>';
  }

  const items = result.all.map(err => {
    const icon = err.level === 'error' ? '❌' : '⚠️';
    const cssClass = err.level === 'error' ? 'validation-error' : 'validation-warning';
    return `<div class="validation-item ${cssClass}">
      <span class="validation-icon">${icon}</span>
      <span class="validation-path">${escapeHtml(err.path)}</span>
      <span class="validation-message">${escapeHtml(err.message)}</span>
    </div>`;
  }).join('');

  const { errorCount, warningCount } = result.summary;

  const errorPart = errorCount > 0 ? `<span class="summary-errors">❌ ${errorCount}개 오류</span>` : '';
  const warningPart = warningCount > 0 ? `<span class="summary-warnings">⚠️ ${warningCount}개 경고</span>` : '';
  const separator = errorPart && warningPart ? ' | ' : '';

  return `<div class="validation-summary">${errorPart}${separator}${warningPart}</div><div class="validation-list">${items}</div>`;
}

/**
 * 검증 결과를 텍스트로 포맷팅 (로그/콘솔용)
 */
export function formatValidationResultText(result: ValidationResult): string {
  if (result.all.length === 0) {
    return '✅ 검증 성공 - 오류 없음';
  }

  const lines = result.all.map(err => {
    const icon = err.level === 'error' ? '❌' : '⚠️';
    return `${icon} [${err.path}] ${err.message}`;
  });

  const { errorCount, warningCount } = result.summary;
  const header = `검증 결과: ${errorCount}개 오류, ${warningCount}개 경고`;

  return [header, '', ...lines].join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
