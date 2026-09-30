// What the Administration screen (ticket 099) shows and offers for an
// account. Pure, so it is tested without rendering.
import { relativeTimeFr } from './relativeTime';

const MONTHS_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

// "2 oct." for an ISO stamp, or null.
function shortDateFr(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

// A request's age: "aujourd’hui", "hier", "il y a 3 j".
export function requestAgeFr(iso, now = new Date()) {
  const relative = relativeTimeFr(iso, now);
  if (relative === null) return '';
  const days = relative === 'hier' || relative.endsWith(' j');
  return days ? relative : 'aujourd’hui';
}

export function accountSubtitle(account, currentId) {
  if (account.id === currentId) return 'Vous';
  if (account.status === 'disabled') return 'Désactivé';
  if (account.status === 'refused') return 'Refusé';
  const since = shortDateFr(account.decidedAt || account.createdAt);
  return since ? `Actif depuis le ${since}` : 'Actif';
}

export function pendingAccounts(accounts) {
  return accounts.filter((a) => a.status === 'pending');
}

// Everything but the pending requests, which have their own section.
export function otherAccounts(accounts) {
  return accounts.filter((a) => a.status !== 'pending');
}

export function pendingLabel(count) {
  return `${count} demande${count > 1 ? 's' : ''}`;
}

// The "⋯" menu of an account: [{ key, label, destructive }]. Nobody can
// disable themselves (the server refuses it too).
export function accountActions(account, currentId) {
  const self = account.id === currentId;
  if (account.status === 'approved') {
    return [
      ...(self ? [] : [{ key: 'disable', label: 'Désactiver', destructive: true }]),
      { key: 'revoke', label: 'Déconnecter partout', destructive: true },
      { key: 'reset', label: 'Réinitialiser le mot de passe', destructive: true },
    ];
  }
  if (account.status === 'disabled') {
    return [
      { key: 'enable', label: 'Réactiver', destructive: false },
      { key: 'reset', label: 'Réinitialiser le mot de passe', destructive: true },
    ];
  }
  if (account.status === 'refused') {
    return [{ key: 'approve', label: 'Approuver', destructive: false }];
  }
  return [];
}
