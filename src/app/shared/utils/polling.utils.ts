export interface PollingHandle {
  stop: () => void;
}

export function startPolling(fn: () => Promise<void>, intervalMs: number): PollingHandle {
  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    timer = setTimeout(async () => {
      if (stopped) return;
      if (!inFlight) {
        inFlight = true;
        try { await fn(); } finally { inFlight = false; }
      }
      if (!stopped) schedule();
    }, intervalMs);
  };

  schedule();

  return {
    stop: () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    },
  };
}
