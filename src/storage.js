/**
 * 設定の読み書き（chrome.storage.sync）。
 *
 * 保存形式:
 *   settings: { enabled: boolean, departments: { [部門ID]: boolean } }
 *
 * departments.js に部門を追加した場合、保存済みの設定に存在しない部門は
 * その部門の defaultEnabled で補完されます。
 */
const DlsiteSettings = (() => {
  const KEY = 'settings';

  function defaults() {
    const departments = {};
    for (const d of DLSITE_DEPARTMENTS) departments[d.id] = d.defaultEnabled;
    return { enabled: true, departments };
  }

  function normalize(raw) {
    const base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    const departments = {};
    for (const d of DLSITE_DEPARTMENTS) {
      const v = raw.departments && raw.departments[d.id];
      departments[d.id] = typeof v === 'boolean' ? v : base.departments[d.id];
    }
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
      departments,
    };
  }

  async function load() {
    const result = await chrome.storage.sync.get(KEY);
    return normalize(result[KEY]);
  }

  async function save(settings) {
    await chrome.storage.sync.set({ [KEY]: normalize(settings) });
  }

  /** 設定から、現在リンク化の対象となる部門の配列を返す */
  function activeDepartments(settings) {
    if (!settings.enabled) return [];
    return DLSITE_DEPARTMENTS.filter((d) => settings.departments[d.id]);
  }

  return { KEY, defaults, normalize, load, save, activeDepartments };
})();
