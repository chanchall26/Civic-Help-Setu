// Helpers for the confirmation step in front of destructive admin actions.
//
// Destructive actions on the admin page (inventory):
//   1. Delete a service guide          -> confirmed here (was window.confirm)
//   2. Dismiss an inaccuracy report    -> confirmed here (had no confirmation)
//   3. Reject a community submission   -> already behind its own review modal
//                                         that requires a note and locks the
//                                         buttons while it saves
// Role changes, approving a submission and resolving a report/audit are not
// removals, so they are left as they are.
//
// Neither delete nor dismiss can be undone from the UI, so none of the copy
// below suggests it can.

/**
 * Stops the same action from running twice at once. A plain ref/closure is used
 * (not React state) because two clicks can land before a state update renders.
 */
export const createActionGuard = () => {
  let pending = false;
  return {
    isPending: () => pending,
    /**
     * @returns {Promise<{status: 'done', value: any} | {status: 'failed', error: Error} | {status: 'busy'}>}
     */
    async run(task) {
      if (pending) return { status: 'busy' };
      pending = true;
      try {
        const value = await task();
        return { status: 'done', value };
      } catch (error) {
        return { status: 'failed', error };
      } finally {
        pending = false;
      }
    },
  };
};

export const buildServiceRemovalDialog = (service, { builtIn = false } = {}) => {
  const name = service?.name || 'this service';
  if (builtIn) {
    return {
      title: 'Clear local changes to this guide?',
      message: `"${name}" is a built-in guide, so it cannot be removed from the directory. This only clears edits saved on this device and puts the original text back. There is no undo for those edits.`,
      itemName: name,
      confirmLabel: 'Clear local changes',
      cancelLabel: 'Keep as is',
    };
  }
  return {
    title: 'Remove this service guide?',
    message: `This removes "${name}" from the active service directory, so citizens will no longer find it. It cannot be undone from here. The removal is written to the audit trail, and the guide would have to be added again by hand.`,
    itemName: name,
    confirmLabel: 'Remove service',
    cancelLabel: 'Keep service',
  };
};

export const buildReportDismissalDialog = (report) => {
  const service = report?.serviceName || 'a service';
  const issue = report?.issueType || 'Reported issue';
  return {
    title: 'Dismiss this report?',
    message: `This deletes the report about "${service}" from the moderation queue. It is not marked as resolved and it cannot be brought back. If the issue was real, use Mark Resolved instead so there is a record of it.`,
    itemName: `${service}: ${issue}`,
    confirmLabel: 'Dismiss report',
    cancelLabel: 'Keep report',
  };
};

/**
 * Runs the delete and reports what actually happened. deleteAdminService swallows
 * storage errors and hands back the current list, so success is checked against
 * that list instead of trusting the call to throw.
 *
 * hadLocalChanges tells the two built-in cases apart: a saved edit that was
 * cleared, or nothing saved so nothing changed. It defaults to true so callers
 * that do not pass it keep the old outcome.
 *
 * @returns {{outcome: 'removed' | 'reverted-to-builtin' | 'nothing-to-clear', services: object[]}}
 * @throws when the service is still listed and it should have been removed
 */
export const removeServiceGuide = ({ id, name, builtIn, actor, deleteService, hadLocalChanges = true, clearOwnership }) => {
  const services = deleteService(id, actor);
  const stillListed = services.some((s) => s.id === id);
  if (!stillListed) {
    // The guide is gone for good, so its review assignment and private note must not outlive it.
    // A failure here must not undo or hide the removal itself.
    if (typeof clearOwnership === 'function') {
      try {
        clearOwnership(id);
      } catch {
        /* the guide is already removed; a stale assignment is harmless and invisible */
      }
    }
    return { outcome: 'removed', services };
  }
  if (builtIn) return { outcome: hadLocalChanges ? 'reverted-to-builtin' : 'nothing-to-clear', services };
  throw new Error(`"${name}" is still in the directory, so nothing was removed.`);
};

/**
 * Same idea for dismissing a report: confirm the report really left the queue.
 * @throws when the report is still listed
 */
export const dismissReportEntry = ({ id, dismissReport }) => {
  const reports = dismissReport(id);
  if (reports.some((r) => r.id === id)) {
    throw new Error('The report is still in the queue, so nothing was dismissed.');
  }
  return reports;
};

/** Text for the inline error. Never includes the underlying exception text. */
export const describeActionFailure = (kind, name) =>
  kind === 'report'
    ? 'The report could not be dismissed and is still in the queue. Try again, or cancel to leave it as it is.'
    : `"${name}" could not be changed and is still in the directory. Try again, or cancel to leave it as it is.`;
