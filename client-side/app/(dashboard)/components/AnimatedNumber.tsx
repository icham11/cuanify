"use client";
import { useEffect, useRef } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
}

export default function AnimatedNumber({ value, duration = 800 }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = 0;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(progress * (value - start) + start);
      el.textContent = current.toLocaleString("id-ID");
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        el.textContent = value.toLocaleString("id-ID");
      }
    };
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span ref={ref}>{value.toLocaleString("id-ID")}</span>;
}
