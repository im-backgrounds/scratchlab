export function createChallengeNavigation({
  dialog,
  isChallengeRunning,
  beforeSwitch,
  onConfirmedInterruption,
}) {
  let pendingNavigation = null;

  return {
    navigate(action, { prepare = true } = {}) {
      if (isChallengeRunning()) {
        pendingNavigation = { action, prepare };
        dialog.showModal();
        return;
      }
      if (prepare) beforeSwitch();
      action();
    },
    confirm() {
      if (!pendingNavigation) return;
      const { action, prepare } = pendingNavigation;
      pendingNavigation = null;
      dialog.close();
      const wasRunning = isChallengeRunning();
      if (prepare) beforeSwitch();
      action();
      if (wasRunning) onConfirmedInterruption();
    },
    dismiss() {
      pendingNavigation = null;
      if (dialog.open) dialog.close();
    },
  };
}
