import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, highlightActiveLineGutter, placeholder } from '@codemirror/view';
import { defaultKeymap, deleteCharBackward, deleteCharForward, history, historyKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown, insertNewlineContinueMarkupCommand, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import { codeBlocks } from './codeBlocks.js';
import { mermaidBlocks } from './mermaidBlocks.js';
import { tables } from './tables.js';
import { lineNumbering } from './lineNumbering.js';
import { blockSelect } from './blockSelect.js';
import { blockStyles } from './blockStyles.js';
import { format, hiddenInline } from './format.js';
import { hiddenLinks, links } from './links.js';
import { renumberLists } from './renumberLists.js';

// Enter ở dòng "- ..." / "1. ..." tự thêm "- " / số tiếp theo; dòng gạch đầu dòng trống thì thoát danh sách.
// Không tự chèn dòng trống giữa các mục (giữ danh sách liền nhau như Notepad).
const markupContinue = insertNewlineContinueMarkupCommand({ nonTightLists: false });
// Chỉ tiếp tục danh sách ("- ", "1. "); không tiếp tục trích dẫn ">" (kể cả dòng chữ nằm liền ngay dưới một dòng trích dẫn,
// markdown coi đó là phần nối tiếp của trích dẫn)
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/;
const continueList = (view) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return LIST_LINE.test(line.text) && markupContinue(view);
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

const listKeymap = keymap.of([
  // Lệnh markdown không làm gì trong khối code: khi đó rơi xuống Enter thường (giữ thụt lề)
  { key: 'Enter', run: (view) => continueBlock(view) || continueList(view) || insertNewlineAndIndent(view) },
  { key: 'Backspace', run: (view) => backspaceOverHidden(view) || deleteMarkupBackward(view) },
  { key: 'Delete', run: deleteOverHidden },
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
const lockExtension = (locked) =>
  locked ? [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.editorAttributes.of({ class: 'cm-locked' })] : [];

export function setLocked(view, locked) {
  view.dispatch({ effects: lockCompartment.reconfigure(lockExtension(locked)) });
}

// Toàn bộ extension của editor văn bản
export function editorExtensions({ onDocChange, locked = false }) {
  return [
    lockCompartment.of(lockExtension(locked)),
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
