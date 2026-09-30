import { needsLogoutConfirmation, unsyncedLogoutMessage } from '../logoutGuard';

const ok = { pushed: 1, pulled: 0, uploaded: 0, downloaded: 0 };

describe('needsLogoutConfirmation (ticket 095)', () => {
  test('synced cleanly with nothing pending: no dialog', async () => {
    const hasPending = jest.fn(async () => false);
    expect(
      await needsLogoutConfirmation({ applicable: true, runNow: async () => ok, hasPending })
    ).toBe(false);
  });

  test('a failed sync asks', async () => {
    const result = { error: { kind: 'network', message: 'Hors ligne' } };
    expect(
      await needsLogoutConfirmation({
        applicable: true,
        runNow: async () => result,
        hasPending: async () => false,
      })
    ).toBe(true);
  });

  test('a sync that throws, or did not run, asks', async () => {
    const hasPending = async () => false;
    const runNow = async () => {
      throw new Error('boom');
    };
    expect(await needsLogoutConfirmation({ applicable: true, runNow, hasPending })).toBe(true);
    expect(
      await needsLogoutConfirmation({ applicable: true, runNow: async () => null, hasPending })
    ).toBe(true);
  });

  test('a successful sync with changes still pending asks', async () => {
    expect(
      await needsLogoutConfirmation({
        applicable: true,
        runNow: async () => ok,
        hasPending: async () => true,
      })
    ).toBe(true);
  });

  test('nothing to sync yet (phone before its first sync): no sync, no dialog', async () => {
    const runNow = jest.fn();
    expect(await needsLogoutConfirmation({ applicable: false, runNow, hasPending: runNow })).toBe(
      false
    );
    expect(runNow).not.toHaveBeenCalled();
  });

  test('the wording depends on the platform', () => {
    expect(unsyncedLogoutMessage('web')).toContain('seront perdues');
    expect(unsyncedLogoutMessage('ios')).toContain('restent en place');
    expect(unsyncedLogoutMessage('ios')).not.toContain('perdues');
  });
});
