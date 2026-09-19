import { RESULTS } from 'react-native-permissions';
import { normalizeLocationResult } from './permissionsManager';

describe('normalizeLocationResult', () => {
  it('maps GRANTED fine location to granted', () => {
    expect(normalizeLocationResult(RESULTS.GRANTED, RESULTS.GRANTED)).toBe('granted');
  });

  it('maps coarse-only (fine denied, coarse granted) to approximate-only', () => {
    expect(normalizeLocationResult(RESULTS.DENIED, RESULTS.GRANTED)).toBe('approximate-only');
  });

  it('maps both denied to denied', () => {
    expect(normalizeLocationResult(RESULTS.DENIED, RESULTS.DENIED)).toBe('denied');
  });

  it('maps BLOCKED to restricted', () => {
    expect(normalizeLocationResult(RESULTS.BLOCKED, RESULTS.BLOCKED)).toBe('restricted');
  });
});
