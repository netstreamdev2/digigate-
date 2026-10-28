import { describe, expect, it } from 'vitest';

import { normaliseIdentifier } from './identifiers';

describe('normaliseIdentifier', () => {
  it('uppercases and strips everything except letters and digits', () => {
    expect(normaliseIdentifier('ca 123-456')).toBe('CA123456');
    expect(normaliseIdentifier(' TEST  GP ')).toBe('TESTGP');
  });
});
