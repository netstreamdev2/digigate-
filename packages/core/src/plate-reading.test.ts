import { describe, expect, it } from 'vitest';

import { plateDifferences, plateReadings, type ReadLine } from './plate-reading';

const line = (text: string, height = 60): ReadLine => ({ text, height });

describe('plateReadings', () => {
  it('reads a Western Cape plate and drops its separators', () => {
    expect(plateReadings([line('CA 123-456')])).toEqual(['CA123456']);
  });

  it('reads a Gauteng plate with its province strip', () => {
    expect(plateReadings([line('GAUTENG', 14), line('HX 47 KL GP')])).toEqual(['HX47KLGP']);
  });

  it('leaves the province words out of the registration', () => {
    expect(plateReadings([line('KWAZULU-NATAL ND 482-913')])).toEqual(['ND482913']);
  });

  it('puts a plate layout ahead of other text, however big that text is', () => {
    expect(plateReadings([line('AUTO 2000', 90), line('CY 70215', 50)])[0]).toBe('CY70215');
  });

  it('prefers the tallest text when nothing matches a layout', () => {
    expect(plateReadings([line('JX4471', 30), line('QZ90871', 70)])).toEqual(['QZ90871', 'JX4471']);
  });

  it('joins the two rows of a square plate', () => {
    expect(plateReadings([line('CA 123'), line('456')])).toContain('CA123456');
  });

  it("doesn't join a plate to small text beneath it", () => {
    expect(plateReadings([line('CA 123-456', 60), line('7', 15)])).toEqual(['CA123456']);
  });

  it('reads a personalised plate, which may have no digits', () => {
    expect(plateReadings([line('BOSS GP')])).toEqual(['BOSSGP']);
  });

  it('ignores text that is too short, too long or has no letters', () => {
    expect(plateReadings([line('A1'), line('12345678'), line('ABCDEFGHIJK123')])).toEqual([]);
  });

  it('ignores a word with no digits that is not a personalised plate', () => {
    expect(plateReadings([line('TOYOTA')])).toEqual([]);
  });

  it('gives at most three readings, without repeats', () => {
    const readings = plateReadings([line('CA 111-111'), line('CA111111'), line('CA 222-222'), line('CA 333-333'), line('CA 444-444')]);
    expect(readings).toHaveLength(3);
    expect(new Set(readings).size).toBe(3);
  });

  it('finds nothing in a photo with no text', () => {
    expect(plateReadings([])).toEqual([]);
  });
});

describe('plateDifferences', () => {
  it('marks the one character that slipped', () => {
    expect(plateDifferences('SA 123-456', 'CA123456')).toEqual([
      { character: 'S', differs: true },
      { character: 'A', differs: false },
      { character: '1', differs: false },
      { character: '2', differs: false },
      { character: '3', differs: false },
      { character: '4', differs: false },
      { character: '5', differs: false },
      { character: '6', differs: false },
    ]);
  });

  it('marks nothing when the plates are the same', () => {
    expect(plateDifferences('CA 123-456', 'ca123456')?.every((character) => !character.differs)).toBe(true);
  });

  it("won't compare plates of different lengths", () => {
    expect(plateDifferences('CA12345', 'CA123456')).toBeNull();
  });
});
