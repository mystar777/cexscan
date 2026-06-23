import { useCallback, useEffect, useRef, useState } from "react";
import { useDragScroll } from "../hooks/useDragScroll";
import "./HorizontalCarousel.css";

export default function HorizontalCarousel({
  label,
  children,
  className = "",
  scrollStep = 200,
}) {
  const scrollRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const dragging = useDragScroll(scrollRef);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setCanLeft(scrollLeft > 4);
    setCanRight(maxScroll > 4 && scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  function scrollBy(dx) {
    scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  }

  return (
    <div className={`h-carousel ${className}`.trim()}>
      {label && <span className="h-carousel-label">{label}</span>}
      <div className="h-carousel-row">
        <button
          type="button"
          className={`carousel-arrow left ${canLeft ? "active" : ""}`}
          onClick={() => scrollBy(-scrollStep)}
          aria-label="Previous"
        >
          ‹
        </button>
        <div
          className={`h-carousel-track${dragging ? " is-dragging" : ""}`}
          ref={scrollRef}
        >
          {children}
        </div>
        <button
          type="button"
          className={`carousel-arrow right ${canRight ? "active" : ""}`}
          onClick={() => scrollBy(scrollStep)}
          aria-label="Next"
        >
          ›
        </button>
      </div>
    </div>
  );
}
