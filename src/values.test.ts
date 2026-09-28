import { describe, expect, it } from 'vitest';

import { formatPlaytime } from './values.js';

describe('formatPlaytime', () => {
  it('states a coarse unit and the raw hours', () => {
    expect(formatPlaytime(60 * 3)).toBe('3 hours (3h)');
    expect(formatPlaytime(60 * 24 * 120)).toBe('4 months (2880h)');
  });

  it('gives hours alone under an hour, where a coarser unit says nothing', () => {
    expect(formatPlaytime(45)).toBe('0h');
    expect(formatPlaytime(1)).toBe('0h');
  });

  it('is empty when Steam said nothing, so the line drops', () => {
    expect(formatPlaytime(0)).toBe('');
    expect(formatPlaytime(-5)).toBe('');
  });
});
