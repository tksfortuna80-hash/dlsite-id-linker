/**
 * DLsite 販売部門（フロア）の定義。
 *
 * 検出・リンク生成・設定画面はすべてこの配列を参照します。
 * 部門を追加・変更するときは、このファイルだけを編集してください。
 *
 *   id             : 部門ID（設定の保存キー、リンクの data-dlsite-dept 属性に使用）
 *   label          : 表示名
 *   prefix         : 作品番号の接頭辞（英字2文字、大文字で記述）
 *   floor          : DLsite のフロア識別子（URL のパス部分。リンクの data-dlsite-floor 属性に使用）
 *   floorLabel     : フロアの表示名（ポップアップに表示）
 *   color          : フロアを区別するための色（ポップアップのバッジ、リンクの下線色）
 *   urlTemplate    : リンク先。{ID} が大文字に正規化した作品番号に置き換わる
 *   defaultEnabled : 初期状態で有効にするか
 */
const DLSITE_DEPARTMENTS = Object.freeze([
  Object.freeze({
    id: 'doujin',
    label: '同人',
    prefix: 'RJ',
    floor: 'maniax',
    floorLabel: '同人フロア',
    color: '#d6336c',
    urlTemplate: 'https://www.dlsite.com/maniax/work/=/product_id/{ID}.html',
    defaultEnabled: true,
  }),
  Object.freeze({
    id: 'books',
    label: '成年コミック・書籍',
    prefix: 'BJ',
    floor: 'books',
    floorLabel: '書籍フロア',
    color: '#e8590c',
    urlTemplate: 'https://www.dlsite.com/books/work/=/product_id/{ID}.html',
    defaultEnabled: false,
  }),
  Object.freeze({
    id: 'pcsoft',
    label: 'PCソフト・美少女ゲーム',
    prefix: 'VJ',
    floor: 'pro',
    floorLabel: '美少女ゲームフロア',
    color: '#1c7ed6',
    urlTemplate: 'https://www.dlsite.com/pro/work/=/product_id/{ID}.html',
    defaultEnabled: false,
  }),
]);

/** 作品番号の数字部分として許可する桁数（長い順に並べること） */
const DLSITE_ID_DIGIT_LENGTHS = Object.freeze([8, 6]);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 有効な部門の接頭辞から検出用の正規表現を組み立てる。
 * 例: /(?<![A-Za-z0-9])(RJ|BJ)(\d{8}|\d{6})(?![A-Za-z0-9])/gi
 * 前後が英数字に接しているもの（XRJ123456、RJ1234567890 など）は対象外。
 * 有効な部門がなければ null。
 */
function buildDlsiteIdPattern(departments) {
  if (!departments.length) return null;
  const prefixes = departments.map((d) => escapeRegExp(d.prefix)).join('|');
  const digits = DLSITE_ID_DIGIT_LENGTHS.map((n) => `\\d{${n}}`).join('|');
  return new RegExp(`(?<![A-Za-z0-9])(${prefixes})(${digits})(?![A-Za-z0-9])`, 'gi');
}

function findDlsiteDepartmentByPrefix(prefix) {
  const upper = prefix.toUpperCase();
  return DLSITE_DEPARTMENTS.find((d) => d.prefix.toUpperCase() === upper) || null;
}

/** 作品番号を大文字に正規化してリンク先URLを作る */
function buildDlsiteWorkUrl(department, workId) {
  return department.urlTemplate.split('{ID}').join(workId.toUpperCase());
}
