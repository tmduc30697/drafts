import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewlineAndIndent } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown, insertNewlineContinueMarkupCommand, deleteMarkupBackward } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';
import { codeBlockBackground } from './codeBlocks.js';
import { slashMenu } from './slashMenu.js';

// Enter ở dòng "- ..." / "1. ..." tự thêm "- " / số tiếp theo; dòng gạch đầu dòng trống thì thoát danh sách.
// Không tự chèn dòng trống giữa các mục (giữ danh sách liền nhau như Notepad).
const continueList = insertNewlineContinueMarkupCommand({ nonTightLists: false });

const listKeymap = keymap.of([
  // Lệnh markdown không làm gì trong khối code: khi đó rơi xuống Enter thường (giữ thụt lề)
  { key: 'Enter', run: (view) => continueList(view) || insertNewlineAndIndent(view) },
  { key: 'Backspace', run: deleteMarkupBackward },
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

// Toàn bộ extension của editor văn bản
export function editorExtensions({ onDocChange }) {
  return [
    history(),
    EditorView.lineWrapping,
    markdown({ codeLanguages: languages, addKeymap: false }),
    syntaxHighlighting(codeHighlight),
    codeBlockBackground,
    slashMenu,
    listKeymap,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    placeholder('Gõ nội dung… (gõ / để chèn khối code)'),
    EditorView.contentAttributes.of({ 'aria-label': 'Nội dung trang' }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onDocChange(u);
    }),
  ];
}
