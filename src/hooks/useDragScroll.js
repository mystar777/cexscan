import { useEffect, useRef, useState } from "react";

const DRAG_THRESHOLD = 6;

/** Horizontal drag-scroll; short clicks still pass through to children */
export function useDragScroll(ref) {
  const state = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const isTextInput = (target) =>
      target.closest("input, select, textarea, option");

    const onMouseDown = (e) => {
      if (e.button !== 0 || isTextInput(e.target)) return;
      state.current = {
        active: true,
        startX: e.pageX,
        scrollLeft: el.scrollLeft,
        moved: false,
      };
    };

    const onMouseMove = (e) => {
      if (!state.current.active) return;
      const dx = e.pageX - state.current.startX;
      if (!state.current.moved && Math.abs(dx) > DRAG_THRESHOLD) {
        state.current.moved = true;
        setDragging(true);
      }
      if (state.current.moved) {
        e.preventDefault();
        el.scrollLeft = state.current.scrollLeft - dx;
      }
    };

    const endDrag = () => {
      if (!state.current.active) return;
      if (state.current.moved) {
        const blockClick = (ev) => {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          el.removeEventListener("click", blockClick, true);
        };
        el.addEventListener("click", blockClick, true);
      }
      state.current = { active: false, startX: 0, scrollLeft: 0, moved: false };
      setDragging(false);
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);

    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", endDrag);
    };
  }, [ref]);

  return dragging;
}
