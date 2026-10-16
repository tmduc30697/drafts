import { createContext, useContext, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { computeMove, isCollection, UNTITLED, UNTITLED_COLLECTION } from '../../data/tree.js';
import { reorderPages } from '../../data/pages.js';
import { DocIcon, FolderIcon } from '../icons.jsx';

// Trạng thái kéo thả hiện tại: mục đang kéo + chỗ sẽ thả ({ id, pos: 'before' | 'after' | 'inside' })
const DragState = createContext({ activeId: null, drop: null });

// Toạ độ con trỏ hiện tại = điểm bắt đầu kéo + quãng đường đã kéo
function pointerY(event) {
  const e = event.activatorEvent;
  const startY = e?.touches?.[0]?.clientY ?? e?.clientY ?? 0;
  return startY + event.delta.y;
}

// Nửa trên của hàng đích = chèn trước, nửa dưới = chèn sau.
// Kéo một trang lên hàng collection: cả hàng là "thả vào collection" (trang không đứng ngoài collection được).
function dropPosition(event, intoCollection) {
  const rect = event.over?.rect;
  if (!rect) return null;
  if (intoCollection) return 'inside';
  return pointerY(event) < rect.top + rect.height / 2 ? 'before' : 'after';
}

// tree: kết quả buildList; onDropInside(id): gọi sau khi thả trang vào collection id (để mở collection ra)
export function ListDnd({ uid, tree, titleOf, onDropInside, children }) {
  const [activeId, setActiveId] = useState(null);
  const [drop, setDrop] = useState(null);

  const sensors = useSensors(
    // Chuột: kéo quá 5px mới tính là kéo, để click vẫn mở trang
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Cảm ứng: nhấn giữ 300ms mới kéo, để vuốt cuộn sidebar bình thường
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const update = (event) => {
    const overId = event.over?.id;
    const over = overId && tree.byId.get(overId);
    const active = tree.byId.get(event.active.id);
    const pos = dropPosition(event, over && active && isCollection(over) && !isCollection(active));
    // Chỗ thả không hợp lệ (vd. trang ra ngoài collection): không hiện vạch báo vị trí
    if (!overId || !pos || overId === event.active.id || !computeMove(tree, event.active.id, { id: overId, pos })) setDrop(null);
    else if (drop?.id !== overId || drop?.pos !== pos) setDrop({ id: overId, pos });
  };

  const reset = () => {
    setActiveId(null);
    setDrop(null);
  };

  const onDragEnd = (event) => {
    const target = drop;
    reset();
    if (!target) return;
    const orders = computeMove(tree, event.active.id, target);
    if (!orders) return;
    reorderPages(uid, orders);
    if (target.pos === 'inside') onDropInside?.(target.id);
  };

  const active = activeId ? tree.byId.get(activeId) : null;

  return (
    <DragState.Provider value={{ activeId, drop }}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setActiveId(e.active.id)}
        onDragMove={update}
        onDragOver={update}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="tree-drag-overlay">
              <span className="tree-icon">{isCollection(active) ? <FolderIcon size={16} /> : <DocIcon size={16} />}</span>
              <span className="tree-title">{titleOf(active) || (isCollection(active) ? UNTITLED_COLLECTION : UNTITLED)}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragState.Provider>
  );
}

// Gắn khả năng kéo + nhận thả vào một hàng trong danh sách
export function useListRowDnd(id) {
  const { activeId, drop } = useContext(DragState);
  const drag = useDraggable({ id });
  const dropZone = useDroppable({ id });
  const setRef = (el) => {
    drag.setNodeRef(el);
    dropZone.setNodeRef(el);
  };
  return {
    setRef,
    dragProps: { ...drag.attributes, ...drag.listeners },
    isDragging: activeId === id,
    dropPos: drop?.id === id ? drop.pos : null,
  };
}
