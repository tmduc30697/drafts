import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// "Chọn cả khối" (bảng, sơ đồ Mermaid, khối code) như chọn một dòng: con trỏ của editor nằm ở đầu khối
// để khối được tô như dòng đang chọn, nhưng ẩn con trỏ nhấp nháy và không cho gõ / xóa
// (gõ lúc này sẽ chèn chữ vào trước ``` hoặc trước dòng bảng, làm hỏng khối).
// Di chuyển con trỏ hoặc sửa nội dung theo cách khác là thoát trạng thái này.

const selectBlockEffect = StateEffect.define();

const blockSelected = StateField.define({
  create: () => false,
  update(value, tr) {
    if (tr.effects.some((e) => e.is(selectBlockEffect))) return true;
    if (tr.selection || tr.docChanged) return false;
    return value;
  },
  provide: (field) =>
    EditorView.contentAttributes.compute([field], (state) => (state.field(field) ? { class: 'cm-blockSelected' } : {})),
});

const guardTyping = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.startState.field(blockSelected)) return tr;
  return tr.isUserEvent('input.type') || tr.isUserEvent('input.paste') || tr.isUserEvent('delete') ? [] : tr;
});

// Chọn cả khối bắt đầu ở vị trí pos (đầu dòng đầu tiên của khối)
export function selectBlock(view, pos) {
  view.focus();
  view.dispatch({ selection: { anchor: pos }, effects: selectBlockEffect.of(null) });
}

// Hiệu ứng để giữ trạng thái "chọn cả khối" qua một lần sửa (vd. thụt lề cả khối): không chọn khối thì không có gì
export const blockSelectEffects = (state) => (state.field(blockSelected, false) ? [selectBlockEffect.of(null)] : []);

export const blockSelect = [blockSelected, guardTyping];
