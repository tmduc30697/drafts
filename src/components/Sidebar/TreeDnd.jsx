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
import { computeMove, isSelfOrDescendant, UNTITLED } from '../../data/tree.js';
import { movePage } from '../../data/pages.js';

// Trạng thái kéo thả hiện tại: trang đang kéo + chỗ sẽ thả ({ id, pos })
const DragState = createContext({ activeId: null, drop: null });

// Toạ độ con trỏ hiện tại = điểm bắt đầu kéo + quãng đường đã kéo
function pointerY(event) {
  const e = event.activatorEvent;
  const startY = e?.touches?.[0]?.clientY ?? e?.clientY ?? 0;
  return startY + event.delta.y;
}

// Chia hàng đích thành 3 vùng: 1/4 trên = chèn trước, 1/4 dưới = chèn sau, giữa = thành trang con
function dropPosition(event) {
  const rect = event.over?.rect;
  if (!rect) return null;
  const ratio = (pointerY(event) - rect.top) / rect.height;
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

export function TreeDnd({ uid, tree, ctx, children }) {
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
    const pos = dropPosition(event);
    if (!overId || !pos || isSelfOrDescendant(tree, event.active.id, overId)) setDrop(null);
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
    const move = computeMove(tree, event.active.id, target.id, target.pos, (id) => ctx.expanded.has(id));
    if (!move) return;
    movePage(uid, event.active.id, move.parentId, move.orders);
    if (move.parentId) ctx.expand(move.parentId);
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
              <span className="tree-icon">{active.icon || '📄'}</span>
              <span className="tree-title">{ctx.titleOf(active) || UNTITLED}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragState.Provider>
  );
}

// Gắn khả năng kéo + nhận thả vào một hàng trong cây
export function useTreeRowDnd(id) {
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
