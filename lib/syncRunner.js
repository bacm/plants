// Runs a sync task one at a time (ticket 094). A request made while a run is
// in flight does not start a second one: it marks "run again once done", so a
// write made mid-sync is still picked up. Pure; the task is injected.

export function createSyncRunner(task) {
  let current = null;
  let busy = false;
  let again = false;

  function request() {
    if (busy) {
      again = true;
      return current;
    }
    busy = true;
    current = (async () => {
      let last = null;
      try {
        do {
          again = false;
          last = await task();
          // A dead session or a failed run is not retried in a tight loop.
          if (last?.error) again = false;
        } while (again);
      } finally {
        busy = false;
        current = null;
      }
      return last;
    })();
    return current;
  }

  return { request, isRunning: () => busy };
}
