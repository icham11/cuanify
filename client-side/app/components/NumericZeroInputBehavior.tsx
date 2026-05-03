"use client";

import { useEffect } from "react";

function isEligibleInput(target: EventTarget | null): target is HTMLInputElement {
  return (
    target instanceof HTMLInputElement &&
    target.type === "number" &&
    !target.disabled &&
    !target.readOnly
  );
}

function shouldSelectZeroValue(input: HTMLInputElement) {
  const value = input.value.trim();
  return value === "0" || value === "0.0" || value === "0.00";
}

export default function NumericZeroInputBehavior() {
  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!isEligibleInput(target)) return;
      if (!shouldSelectZeroValue(target)) return;

      requestAnimationFrame(() => {
        if (document.activeElement !== target) return;
        if (!shouldSelectZeroValue(target)) return;
        target.select();
      });
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  return null;
}
