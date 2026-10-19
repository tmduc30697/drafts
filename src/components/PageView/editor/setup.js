import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap, highlightActiveLine, highlightActiveLineGutter, placeholder } from '@codemirror/view';
import { defaultKeymap, deleteCharBackward, deleteCharForward, history, historyKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { createSearchPanel } from './searchPanel.js';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown, insertNewlineContinueMarkupCommand, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import { codeBlocks } from './codeBlocks.js';
import { mermaidBlocks } from './mermaidBlocks.js';
import { tables } from './tables.js';
import { lineNumbering } from './lineNumbering.js';
import { blockSelect } from './blockSelect.js';
import { headings } from './headings.js';
import { blockStyles } from './blockStyles.js';
import { format, hiddenInline } from './format.js';
import { hiddenLinks, links } from './links.js';
import { renumberLists } from './renumberLists.js';
import { indentKeymap } from './indent.js';

// Enter ở dòng "- ..." / "1. ..." tự thêm "- " / số tiếp theo; dòng gạch đầu dòng trống thì thoát danh sách.
// Không tự chèn dòng trống giữa các mục (giữ danh sách liền nhau như Notepad).
const markupContinue = insertNewlineContinueMarkupCommand({ nonTightLists: false });
// Chỉ tiếp tục danh sách ("- ", "1. "); không tiếp tục trích dẫn ">" (kể cả dòng chữ nằm liền ngay dưới một dòng trích dẫn,
// markdown coi đó là phần nối tiếp của trích dẫn)
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/;
const continueList = (view) => {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.head);
  if (!LIST_LINE.test(line.text)) return false;
  let tr = null;
  if (!markupContinue({ state, dispatch: (t) => (tr = t) })) return false;
  // Danh sách "lỏng" (có dòng trống giữa các mục, vd. ngăn cách hai nhóm) thì thư viện luôn chèn thêm một dòng trống
  // trước mục mới; bỏ dòng trống đó để mục mới nằm ngay dưới mục đang gõ
  let removed = 0;
  const changes = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, text) => {
    let insert = text.toString();
    const blank = /^\n[ \t>]*\n/.exec(insert);
    if (blank) {
      insert = insert.slice(blank[0].length - 1);
      removed += blank[0].length - 1;
    }
    changes.push({ from: fromA, to: toA, insert });
  });
  if (!removed || state.selection.ranges.length > 1) view.dispatch(tr);
  else view.dispatch({ changes, selection: { anchor: tr.selection.main.head - removed }, scrollIntoView: true, userEvent: 'input' });
  return true;
};

// Enter ở dòng "- [ ] ...": thêm việc mới; dòng không có nội dung thì thoát kiểu đó. (Trích dẫn "> " không tự tiếp tục.)
function continueBlock(view) {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  const line = state.doc.lineAt(range.from);
  const m = /^(\s*)(- \[[ xX]\] )/.exec(line.text);
  if (!m || range.from < line.from + m[0].length) return false;
  if (line.text.length === m[0].length) {
    // Dòng trống: bỏ ký hiệu, thoát khỏi kiểu
    view.dispatch({ changes: { from: line.from, to: line.to, insert: m[1] }, selection: { anchor: line.from + m[1].length }, userEvent: 'input' });
    return true;
  }
  view.dispatch({ ...state.replaceSelection('\n' + m[1] + '- [ ] '), scrollIntoView: true, userEvent: 'input' });
  return true;
}

// Backspace ngay sau ký hiệu định dạng đang bị ẩn (**, [, `...): xóa ký tự nhìn thấy phía trước thay vì xóa ký hiệu ẩn
// (xóa mất ký hiệu mở sẽ làm ký hiệu đóng bị lộ ra)
function backspaceOverHidden(view) {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const sets = [hiddenInline(view), hiddenLinks(view)];
  let pos = sel.head;
  for (let moved = true; moved; ) {
    moved = false;
    for (const set of sets) {
      set.between(pos, pos, (from, to) => {
        if (to === pos && from < pos) {
          pos = from;
          moved = true;
        }
      });
    }
  }
  if (pos === sel.head) return false;
  view.dispatch({ selection: { anchor: pos } });
  return deleteMarkupBackward(view) || deleteCharBackward(view);
}

// Delete ngay trước ký hiệu định dạng đang bị ẩn: xóa ký tự nhìn thấy phía sau thay vì xóa ký hiệu ẩn
function deleteOverHidden(view) {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;
  const sets = [hiddenInline(view), hiddenLinks(view)];
  let pos = sel.head;
  for (let moved = true; moved; ) {
    moved = false;
    for (const set of sets) {
      set.between(pos, pos, (from, to) => {
        if (from === pos && to > pos) {
          pos = to;
          moved = true;
        }
      });
    }
  }
  if (pos === sel.head) return false;
  view.dispatch({ selection: { anchor: pos } });
  return deleteCharForward(view);
}

// ⌘D / Ctrl+D (như Sublime Text): chưa chọn gì thì chọn từ đang đặt con trỏ; đang chọn một đoạn thì thêm vùng chọn kế tiếp
// có cùng nội dung (tìm từ vùng chọn gần nhất, hết trang thì quay lại đầu)
function selectNextOccurrence(view) {
  const { state } = view;
  if (!state.facet(EditorState.allowMultipleSelections)) return false; // trang khóa
  const main = state.selection.main;
  if (main.empty) {
    const word = state.wordAt(main.head);
    if (!word) return false;
    view.dispatch({ selection: EditorSelection.single(word.from, word.to), scrollIntoView: true });
    return true;
  }
  const text = state.sliceDoc(main.from, main.to);
  const doc = state.doc.toString();
  // Mọi vị trí xuất hiện của đoạn đang chọn
  const starts = [];
  for (let i = doc.indexOf(text); i >= 0; i = doc.indexOf(text, i + text.length)) starts.push(i);
  const taken = (from) => state.selection.ranges.some((r) => r.from === from);
  // Ưu tiên chỗ trùng đầu tiên phía sau vùng chọn hiện tại, hết thì quay lại từ đầu trang; chọn hết rồi thì thôi
  const at = starts.find((i) => i >= main.to && !taken(i)) ?? starts.find((i) => !taken(i));
  if (at === undefined) return true;
  view.dispatch({
    selection: EditorSelection.create([...state.selection.ranges, EditorSelection.range(at, at + text.length)], state.selection.ranges.length),
    scrollIntoView: true,
  });
  return true;
}

// Ô tìm kiếm (⌘F / Ctrl+F) như Sublime Text (searchPanel.js): regex / phân biệt hoa thường / cả từ, Tìm, Tìm trước, Tất cả. Bỏ ⌘D của thư viện vì app có ⌘D riêng.
const searchExtensions = [
  search({ top: false, createPanel: createSearchPanel }), // ô tìm kiểu Sublime, nằm ở dưới cùng
  // Bôi chọn một đoạn chữ thì các chỗ khớp khác hiện khung bao quanh (như Sublime Text)
  highlightSelectionMatches({ minSelectionLength: 2 }),
  keymap.of(searchKeymap.filter((k) => k.key !== 'Mod-d')),
];

// Alt+Enter (như Sublime Text): chọn tất cả các chỗ trùng với đoạn đang chọn (chưa chọn gì thì lấy từ đang đặt con trỏ)
function selectAllOccurrences(view) {
  const { state } = view;
  if (!state.facet(EditorState.allowMultipleSelections)) return false; // trang khóa
  let main = state.selection.main;
  if (main.empty) {
    const word = state.wordAt(main.head);
    if (!word) return false;
    main = EditorSelection.range(word.from, word.to);
  }
  const text = state.sliceDoc(main.from, main.to);
  const doc = state.doc.toString();
  const ranges = [];
  for (let i = doc.indexOf(text); i >= 0; i = doc.indexOf(text, i + text.length)) ranges.push(EditorSelection.range(i, i + text.length));
  // Vùng chọn chính là chỗ đang chọn (hoặc chỗ trùng đầu tiên trên từ đang đứng)
  const index = Math.max(0, ranges.findIndex((r) => r.from === main.from));
  view.dispatch({ selection: EditorSelection.create(ranges, index), scrollIntoView: true });
  return true;
}

const listKeymap = keymap.of([
  { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
  { key: 'Alt-Enter', run: selectAllOccurrences, preventDefault: true },
  // Lệnh markdown không làm gì trong khối code: khi đó rơi xuống Enter thường (giữ thụt lề)
  { key: 'Enter', run: (view) => continueBlock(view) || continueList(view) || insertNewlineAndIndent(view) },
  { key: 'Backspace', run: (view) => backspaceOverHidden(view) || deleteMarkupBackward(view) },
  { key: 'Delete', run: deleteOverHidden },
  // Thụt lề (khối code / Mermaid dịch cả khối), trước indentWithTab và ⌘] ⌘[ mặc định
  ...indentKeymap,
]);

// Chỉ tô màu cú pháp bên trong khối code. Phần văn bản markdown (tiêu đề, in đậm...)
// không được tô gì để trông như văn bản thuần.
const codeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--code-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--code-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-function)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--code-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--code-property)' },
]);

// Khóa trang: chỉ đọc (không gõ, không sửa/xóa khối), vẫn chọn và sao chép được
const lockCompartment = new Compartment();
// Trang mở khóa: nhiều con trỏ (⌘/Ctrl + bấm chuột thêm một con trỏ; drawSelection để vẽ được nhiều con trỏ/vùng chọn).
// Trang khóa: chỉ đọc, dùng vùng chọn mặc định của trình duyệt (không vẽ lại, để bôi chọn trong tài liệu chỉ đọc vẫn thấy).
const lockExtension = (locked) =>
  locked
    ? [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.editorAttributes.of({ class: 'cm-locked' })]
    : [EditorState.allowMultipleSelections.of(true), drawSelection(), EditorView.clickAddsSelectionRange.of((e) => e.metaKey || e.ctrlKey)];

export function setLocked(view, locked) {
  view.dispatch({ effects: lockCompartment.reconfigure(lockExtension(locked)) });
}

// Toàn bộ extension của editor văn bản
export function editorExtensions({ onDocChange, locked = false }) {
  return [
    lockCompartment.of(lockExtension(locked)),
    ...searchExtensions,
    lineNumbering,
    highlightActiveLine(),
    highlightActiveLineGutter(),
    history(),
    EditorView.lineWrapping,
    markdown({ codeLanguages: languages, addKeymap: false }),
    syntaxHighlighting(codeHighlight),
    codeBlocks,
    mermaidBlocks,
    tables,
    blockSelect,
    links,
    format,
    blockStyles,
    headings, // trước listKeymap: Backspace ở đầu tiêu đề bỏ kiểu tiêu đề
    renumberLists,
    listKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    placeholder('Gõ nội dung…'),
    EditorView.contentAttributes.of({ 'aria-label': 'Nội dung trang' }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onDocChange(u);
    }),
  ];
}
