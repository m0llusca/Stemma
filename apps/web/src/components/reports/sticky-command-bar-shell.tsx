"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const stuckHysteresisPx = 4;

function getTopbarHeight() {
  const rawTopbarHeight = getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-height");
  return Number.parseFloat(rawTopbarHeight) || 0;
}

export function StickyCommandBarShell({
  children,
  className,
  ariaLabel
}: {
  children: ReactNode;
  className: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const isStuckRef = useRef(false);
  const reservedHeightRef = useRef<number | null>(null);
  const stuckScrollYRef = useRef<number | null>(null);
  const [reservedHeight, setReservedHeight] = useState<number | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    let frame = 0;

    const updateReservedHeight = () => {
      if (!ref.current || isStuckRef.current) {
        return;
      }

      const nextHeight = Math.ceil(ref.current.getBoundingClientRect().height);

      if (nextHeight <= 0 || (reservedHeightRef.current !== null && nextHeight <= reservedHeightRef.current)) {
        return;
      }

      reservedHeightRef.current = nextHeight;
      setReservedHeight(nextHeight);
    };

    const measureStuckPoint = () => {
      if (!slotRef.current) {
        return null;
      }

      const elementTop = slotRef.current.offsetTop || slotRef.current.getBoundingClientRect().top + window.scrollY;
      return Math.max(0, elementTop - getTopbarHeight());
    };

    const update = () => {
      if (!ref.current) {
        return;
      }

      updateReservedHeight();

      if (stuckScrollYRef.current === null) {
        stuckScrollYRef.current = measureStuckPoint();
      }

      const stuckScrollY = stuckScrollYRef.current;

      if (stuckScrollY === null) {
        return;
      }

      const releaseScrollY = Math.max(0, stuckScrollY - stuckHysteresisPx);
      const nextIsStuck = isStuckRef.current ? window.scrollY >= releaseScrollY : window.scrollY >= stuckScrollY;

      if (nextIsStuck !== isStuckRef.current) {
        isStuckRef.current = nextIsStuck;
        setIsStuck(nextIsStuck);
      }
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    const handleResize = () => {
      stuckScrollYRef.current = null;
      if (!isStuckRef.current) {
        reservedHeightRef.current = null;
      }
      scheduleUpdate();
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div ref={slotRef} className={`${className}__slot`} style={reservedHeight ? { minHeight: `${reservedHeight}px` } : undefined}>
      <section ref={ref} className={`${className} ${isStuck ? `${className}--stuck` : ""}`} aria-label={ariaLabel}>
        {children}
      </section>
    </div>
  );
}
