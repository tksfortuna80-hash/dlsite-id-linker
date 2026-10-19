/**
 * ページ内のテキストから DLsite の作品番号を検出してリンクに変換する。
 * departments.js / storage.js の後に読み込まれる前提。
 */
(() => {
  'use strict';

  // manifest の exclude_matches に加えた念のための保険
  if (/(^|\.)dlsite\.com$/i.test(location.hostname)) return;
  if (window.__dlsiteIdLinkerLoaded) return;
  window.__dlsiteIdLinkerLoaded = true;

  const LINK_CLASS = 'dlsite-id-link';
  const DEBOUNCE_MS = 250;
  // 一度に溜まった追加ノードがこれを超えたら、個別処理をやめて body 全体を再走査する
  const FULL_RESCAN_THRESHOLD = 500;
  // 最短の作品番号（接頭辞2文字＋数字6桁）より短いテキストは調べない
  const MIN_TEXT_LENGTH = 2 + Math.min(...DLSITE_ID_DIGIT_LENGTHS);

  // 中身を変換しない要素。title / select / option / svg / math はリンクを置いても機能しないため追加している
  const SKIP_TAGS = new Set([
    'a', 'input', 'textarea', 'script', 'style', 'noscript', 'code', 'pre',
    'title', 'select', 'option', 'template', 'svg', 'math',
  ]);
  const SKIP_SELECTOR = [
    ...SKIP_TAGS,
    '[contenteditable]:not([contenteditable="false"])',
    `.${LINK_CLASS}`,
  ].join(',');

  const OBSERVE_OPTIONS = { childList: true, subtree: true, characterData: true };

  let pattern = null;        // 有効な部門から組み立てた RegExp（無効時は null）
  let activeIds = new Set(); // 有効な部門IDの集合
  let observer = null;
  let pendingNodes = new Set();
  let fullRescanPending = false;
  let flushTimer = null;

  // ---- 検出 ---------------------------------------------------------------

  function hasMatch(text) {
    if (text.length < MIN_TEXT_LENGTH) return false;
    pattern.lastIndex = 0;
    const found = pattern.test(text);
    // g フラグ付きの test は lastIndex を進め、matchAll はそれを引き継ぐので必ず戻す
    pattern.lastIndex = 0;
    return found;
  }

  function isSkippedElement(el) {
    return SKIP_TAGS.has(el.localName) || el.classList.contains(LINK_CLASS) || el.isContentEditable;
  }

  /** root 自身が変換対象外の要素の中にあるか */
  function isInsideSkipped(root) {
    const el = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (!el) return true;
    return el.isContentEditable || el.closest(SKIP_SELECTOR) !== null;
  }

  /** root 以下で作品番号を含むテキストノードを集める */
  function collectTextNodes(root) {
    if (isInsideSkipped(root)) return [];
    if (root.nodeType === Node.TEXT_NODE) return hasMatch(root.data) ? [root] : [];
    if (root.nodeType !== Node.ELEMENT_NODE) return [];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // REJECT で子孫ごと読み飛ばす
          return isSkippedElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return hasMatch(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  // ---- リンク化 / 復元 -----------------------------------------------------

  function createLink(matchedText, dept) {
    const workId = matchedText.toUpperCase();
    const a = document.createElement('a');
    a.href = buildDlsiteWorkUrl(dept, workId);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = LINK_CLASS;
    a.dataset.dlsiteDept = dept.id;
    a.dataset.dlsiteFloor = dept.floor;
    a.style.setProperty('--dlsite-floor-color', dept.color);
    a.title = `DLsite ${dept.floorLabel}（${dept.label}）: ${workId}`;
    a.appendChild(document.createTextNode(matchedText));
    return a;
  }

  function linkifyTextNode(textNode) {
    if (!textNode.parentNode) return;
    const text = textNode.data;
    const frag = document.createDocumentFragment();
    let last = 0;
    let linked = 0;

    for (const m of text.matchAll(pattern)) {
      const dept = findDlsiteDepartmentByPrefix(m[1]);
      if (!dept || !activeIds.has(dept.id)) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      frag.appendChild(createLink(m[0], dept));
      last = m.index + m[0].length;
      linked++;
    }
    if (!linked) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function linkify(root) {
    if (!pattern || !root || !root.isConnected) return;
    for (const node of collectTextNodes(root)) linkifyTextNode(node);
  }

  /** 前後のテキストノードと結合して、リンク化前の1つのテキストノードに戻す */
  function mergeAdjacentText(node) {
    let target = node;
    const prev = node.previousSibling;
    if (prev && prev.nodeType === Node.TEXT_NODE) {
      prev.appendData(node.data);
      node.remove();
      target = prev;
    }
    const next = target.nextSibling;
    if (next && next.nodeType === Node.TEXT_NODE) {
      target.appendData(next.data);
      next.remove();
    }
  }

  /** 無効になった部門のリンクを元のテキストに戻す */
  function unlinkInactive() {
    for (const a of document.querySelectorAll(`a.${LINK_CLASS}`)) {
      if (activeIds.has(a.dataset.dlsiteDept)) continue;
      const text = document.createTextNode(a.textContent);
      a.replaceWith(text);
      mergeAdjacentText(text);
    }
  }

  // ---- 動的コンテンツへの対応 ---------------------------------------------

  function scanRoot() {
    return document.body || document.documentElement;
  }

  function enqueue(node) {
    if (fullRescanPending) return;
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return;
    pendingNodes.add(node);
    if (pendingNodes.size > FULL_RESCAN_THRESHOLD) {
      pendingNodes.clear();
      fullRescanPending = true;
    }
  }

  function enqueueRecords(records) {
    for (const r of records) {
      if (r.type === 'characterData') enqueue(r.target);
      else r.addedNodes.forEach(enqueue);
    }
  }

  function onMutations(records) {
    enqueueRecords(records);
    if (!flushTimer && (pendingNodes.size || fullRescanPending)) {
      flushTimer = setTimeout(flush, DEBOUNCE_MS);
    }
  }

  /**
   * 自分の DOM 変更が MutationObserver に拾われて無限ループしないよう、
   * 監視を止めた状態で fn を実行する。止める直前までの記録は取りこぼさず保留に回す。
   */
  function mutateQuietly(fn) {
    if (!observer) return fn();
    enqueueRecords(observer.takeRecords());
    observer.disconnect();
    try {
      fn();
    } finally {
      observer.observe(document.documentElement, OBSERVE_OPTIONS);
    }
  }

  function flush() {
    flushTimer = null;
    const roots = fullRescanPending ? [scanRoot()] : [...pendingNodes];
    pendingNodes = new Set();
    fullRescanPending = false;
    mutateQuietly(() => roots.forEach(linkify));
    // mutateQuietly 中に拾った記録があれば次回に回す
    if (pendingNodes.size || fullRescanPending) flushTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, OBSERVE_OPTIONS);
  }

  function stopObserving() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(flushTimer);
    flushTimer = null;
    pendingNodes = new Set();
    fullRescanPending = false;
  }

  // ---- 設定の反映 ---------------------------------------------------------

  function applySettings(settings) {
    // 保留中の変更は下の全体走査で拾うので破棄してよい
    stopObserving();

    const active = DlsiteSettings.activeDepartments(settings);
    activeIds = new Set(active.map((d) => d.id));
    pattern = buildDlsiteIdPattern(active);

    unlinkInactive();
    if (!pattern) return; // 有効な部門がなければ何もしない
    linkify(scanRoot());
    startObserving();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[DlsiteSettings.KEY]) return;
    applySettings(DlsiteSettings.normalize(changes[DlsiteSettings.KEY].newValue));
  });

  DlsiteSettings.load().then(applySettings);
})();
