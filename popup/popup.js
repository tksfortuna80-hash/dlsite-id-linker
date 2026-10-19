'use strict';

const enabledInput = document.getElementById('enabled');
const list = document.getElementById('departments');
const main = document.getElementById('main');
const statusEl = document.getElementById('status');

let settings = DlsiteSettings.defaults();
const deptInputs = new Map(); // 部門ID -> checkbox

/** departments.js の定義から部門ごとの切り替えを組み立てる（innerHTML は使わない） */
function renderDepartments() {
  for (const d of DLSITE_DEPARTMENTS) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'dept';
    label.style.setProperty('--floor-color', d.color);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      settings.departments[d.id] = input.checked;
      save();
    });
    deptInputs.set(d.id, input);

    const text = document.createElement('span');
    text.className = 'dept-text';
    const name = document.createElement('span');
    name.className = 'dept-name';
    name.textContent = `${d.label}（${d.prefix}）`;
    const floor = document.createElement('span');
    floor.className = 'dept-floor';
    floor.textContent = `${d.floorLabel} — dlsite.com/${d.floor}/`;
    text.append(name, floor);

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = d.prefix;

    label.append(input, text, badge);
    li.appendChild(label);
    list.appendChild(li);
  }
}

function render() {
  enabledInput.checked = settings.enabled;
  main.classList.toggle('disabled', !settings.enabled);
  for (const [id, input] of deptInputs) {
    input.checked = settings.departments[id];
    input.disabled = !settings.enabled;
  }
  const active = DlsiteSettings.activeDepartments(settings);
  if (!settings.enabled) {
    statusEl.textContent = '停止中：ページ内のリンク化は行いません';
  } else if (!active.length) {
    statusEl.textContent = '有効なフロアがありません';
  } else {
    statusEl.textContent = `検出対象：${active.map((d) => d.prefix).join(' / ')}`;
  }
}

async function save() {
  render();
  try {
    await DlsiteSettings.save(settings);
  } catch (e) {
    statusEl.textContent = `保存に失敗しました：${e.message}`;
  }
}

enabledInput.addEventListener('change', () => {
  settings.enabled = enabledInput.checked;
  save();
});

// 他のウィンドウのポップアップや同期で変更された場合も表示を追従させる
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes[DlsiteSettings.KEY]) return;
  settings = DlsiteSettings.normalize(changes[DlsiteSettings.KEY].newValue);
  render();
});

renderDepartments();
DlsiteSettings.load().then((loaded) => {
  settings = loaded;
  render();
});
