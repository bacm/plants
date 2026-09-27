import { parseMonth, parseISODate, validatePlantForm } from '../validation';
import { emptyPlantForm } from '../plantFields';

describe('parseMonth', () => {
  test.each([
    ['', null],
    [' ', null],
    ['1', 1],
    ['12', 12],
    ['07', 7],
  ])('%p -> value %p, no error', (input, value) => {
    expect(parseMonth(input)).toEqual({ value, error: null });
  });

  test.each(['0', '13', '1.5', 'abc'])('%p is an error', (input) => {
    const result = parseMonth(input);
    expect(result.value).toBeNull();
    expect(result.error).toBe('Mois entre 1 et 12');
  });
});

describe('parseISODate', () => {
  test.each([
    ['', null],
    ['2026-02-28', '2026-02-28'],
    ['2028-02-29', '2028-02-29'],
  ])('%p -> value %p, no error', (input, value) => {
    expect(parseISODate(input)).toEqual({ value, error: null });
  });

  test.each(['2026-02-29', '2026-13-01', '2026-1-1', 'hier'])('%p is an error', (input) => {
    const result = parseISODate(input);
    expect(result.value).toBeNull();
    expect(result.error).toBe('Date au format AAAA-MM-JJ');
  });
});

describe('validatePlantForm', () => {
  test('a valid, empty form has no errors', () => {
    expect(validatePlantForm(emptyPlantForm())).toEqual({});
  });

  test('an out-of-range bloom month is keyed on that field', () => {
    const form = { ...emptyPlantForm(), bloomStartMonth: '13', bloomEndMonth: '5' };
    const errors = validatePlantForm(form);
    expect(errors.bloomStartMonth).toBe('Mois entre 1 et 12');
    expect(errors.bloomEndMonth).toBeUndefined();
  });

  test('a start month without an end month errors on the missing one', () => {
    const form = { ...emptyPlantForm(), bloomStartMonth: '3', bloomEndMonth: '' };
    const errors = validatePlantForm(form);
    expect(errors.bloomEndMonth).toBe('Indiquez aussi le mois de fin');
    expect(errors.bloomStartMonth).toBeUndefined();
  });

  test('an end month without a start month errors on the missing one', () => {
    const form = { ...emptyPlantForm(), harvestMonthStart: '', harvestMonthEnd: '9' };
    const errors = validatePlantForm(form);
    expect(errors.harvestMonthStart).toBe('Indiquez aussi le mois de début');
    expect(errors.harvestMonthEnd).toBeUndefined();
  });

  test('a malformed createdAt is reported', () => {
    const form = { ...emptyPlantForm(), createdAt: '2026-13-01' };
    const errors = validatePlantForm(form);
    expect(errors.createdAt).toBe('Date au format AAAA-MM-JJ');
  });
});
