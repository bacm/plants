// Pure logic of the plant journal (ticket 115): care logs and observations
// (measure, note, "en fleur") share the care_logs table. No db or
// react-native import, so lib/db.js, lib/db.web.js, the screens and Jest all
// use it.

import { isCareType, journalLabelFor } from './enums';
import { monthAbbr } from './months';

export const MAX_MEASURE_CM = 10000;

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_MEASURE_CM;
}

/** '' / null / undefined -> null; a whole-number string or number -> a number; else NaN. */
function toSize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  }
  return value;
}

/**
 * Validates and cleans a journal entry before it is stored. Returns
 * `{ type, notes, widthCm, heightCm }` (sizes only for a measurement, else
 * null) or throws a French Error. A measurement needs at least one of width /
 * height, each a positive integer up to MAX_MEASURE_CM; a note needs text.
 */
export function normalizeJournalEntry({ type, notes, widthCm, heightCm }) {
  const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;
  if (type === 'note') {
    if (!cleanNotes) throw new Error('La note ne peut pas être vide.');
    return { type, notes: cleanNotes, widthCm: null, heightCm: null };
  }
  if (type !== 'measured') return { type, notes: cleanNotes, widthCm: null, heightCm: null };
  const width = toSize(widthCm);
  const height = toSize(heightCm);
  if (width === null && height === null) {
    throw new Error('Indiquez au moins une largeur ou une hauteur.');
  }
  for (const [name, value] of [
    ['La largeur', width],
    ['La hauteur', height],
  ]) {
    if (value !== null && !isPositiveInt(value)) {
      throw new Error(
        `${name} doit être un nombre entier de centimètres entre 1 et ${MAX_MEASURE_CM}.`
      );
    }
  }
  return { type, notes: cleanNotes, widthCm: width, heightCm: height };
}

/** "12 sept." from 'YYYY-MM-DD' (anything else comes back unchanged). */
export function formatShortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return iso ?? '';
  return `${Number(match[3])} ${monthAbbr(Number(match[2]))}`;
}

/** "120 × 90 cm", "Largeur 120 cm", "Hauteur 90 cm", or '' without a size. */
export function measurementText({ widthCm, heightCm }) {
  const hasW = widthCm != null;
  const hasH = heightCm != null;
  if (hasW && hasH) return `${widthCm} × ${heightCm} cm`;
  if (hasW) return `Largeur ${widthCm} cm`;
  if (hasH) return `Hauteur ${heightCm} cm`;
  return '';
}

/** Timeline title and meta line of an entry: "Mesuré" / "12 sept. · 120 × 90 cm". */
export function journalEntryText(log) {
  const parts = [formatShortDate(log.date)];
  if (log.type === 'measured') {
    const size = measurementText(log);
    if (size) parts.push(size);
  }
  if (log.notes) parts.push(log.notes);
  return { title: journalLabelFor(log.type), meta: parts.join(' · ') };
}

/** The care entries only (observations never count as care). */
export function careEntries(logs) {
  return (logs ?? []).filter((log) => isCareType(log.type));
}

/** The measurements, oldest first (same-day ones in their given order). */
export function measurementsOf(logs) {
  return (logs ?? [])
    .filter((log) => log.type === 'measured' && (log.widthCm != null || log.heightCm != null))
    .map((log, index) => ({ log, index }))
    .sort((a, b) => a.log.date.localeCompare(b.log.date) || a.index - b.index)
    .map((entry) => entry.log);
}

/** The newest measurement, or null. */
export function latestMeasurement(logs) {
  const all = measurementsOf(logs);
  return all.length ? all[all.length - 1] : null;
}

function dayNumber(iso) {
  return Date.parse(`${iso}T00:00:00Z`) / 86400000;
}

/**
 * Points of the growth curve in a `width` x `height` box (px, with `pad`
 * around). X follows the dates (even spacing when all fall on one day), Y one
 * shared scale over both series (a bigger value is higher). Returns
 * `{ width: [{x, y}], height: [{x, y}] }`; a series only has the measurements
 * that gave that dimension. Empty without two measurements.
 */
export function growthCurve(measurements, { width = 150, height = 56, pad = 4, top = 14 } = {}) {
  const empty = { width: [], height: [] };
  if (!measurements || measurements.length < 2) return empty;
  const days = measurements.map((m) => dayNumber(m.date));
  const first = days[0];
  const span = days[days.length - 1] - first;
  const values = measurements.flatMap((m) => [m.widthCm, m.heightCm]).filter((v) => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const innerW = width - 2 * pad;
  const innerH = height - top - pad;
  const xAt = (i) =>
    pad +
    (span > 0 ? ((days[i] - first) / span) * innerW : (i / (measurements.length - 1)) * innerW);
  const yAt = (v) =>
    max === min ? top + innerH / 2 : top + innerH - ((v - min) / (max - min)) * innerH;
  const series = (key) =>
    measurements.flatMap((m, i) => (m[key] == null ? [] : [{ x: xAt(i), y: yAt(m[key]) }]));
  return { width: series('widthCm'), height: series('heightCm') };
}

/** "x,y x,y" for an SVG polyline, one decimal. */
export function polylinePoints(points) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
