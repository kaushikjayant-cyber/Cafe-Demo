"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export interface ToastHandle {
  message: string | null;
  show: (message: string) => void;
}

export function useStaffToast(): ToastHandle {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((next: string) => {
    setMessage(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);
  return useMemo(() => ({ message, show }), [message, show]);
}

export function StaffToast({ toast }: { toast: ToastHandle }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {toast.message && (
        <p key={toast.message} className="anim-toast rounded-xl bg-[var(--g-ink)] px-4 py-3 text-sm text-white shadow-lg">
          {toast.message}
        </p>
      )}
    </div>
  );
}
