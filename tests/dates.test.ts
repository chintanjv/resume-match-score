import { describe, expect, it } from 'vitest';
import { mergedMonths, monthIndex, parseDateRange } from '../src/engine/resume/dates';
import { parseResume } from '../src/engine/resume';
import { NOW } from './helpers';

const m = monthIndex;

describe('date ranges', () => {
  it.each([
    ['Jan 2020 – Present', m(2020, 0), NOW],
    ['January 2020 - Current', m(2020, 0), NOW],
    ['2019–2021', m(2019, 0), m(2021, 0)],
    ['03/2018 - 06/2020', m(2018, 2), m(2020, 5)],
    ['3/2018–6/2020', m(2018, 2), m(2020, 5)],
    ['2018.03 - 2020.06', m(2018, 2), m(2020, 5)],
    ['Summer 2017', m(2017, 5), m(2017, 7)],
    ['Fall 2019', m(2019, 8), m(2019, 10)],
    ['Q3 2021 - Q1 2022', m(2021, 6), m(2022, 2)],
    ["'19 – '21", m(2019, 0), m(2021, 0)],
    ['2020 to now', m(2020, 0), NOW],
    ['Sept. 2015 – Aug. 2017', m(2015, 8), m(2017, 7)],
    ["Jun '18 - Mar '20", m(2018, 5), m(2020, 2)],
    ['Dec 2019 — present', m(2019, 11), NOW],
    ['May 2016 to June 2018', m(2016, 4), m(2018, 5)],
    ['Senior PM | Stripe | Mar 2021 – Present', m(2021, 2), NOW],
  ])('parses "%s"', (text, start, end) => {
    expect(parseDateRange(text, NOW)).toMatchObject({ start, end });
  });

  it('ignores non-dates', () => {
    expect(parseDateRange('Grew revenue 40% across 12 markets', NOW)).toBeNull();
    expect(parseDateRange('Scaled to 300,000 users', NOW)).toBeNull();
  });

  it('merges overlapping ranges', () => {
    expect(
      mergedMonths([
        [m(2018, 0), m(2019, 11)],
        [m(2019, 6), m(2020, 11)],
        [m(2022, 0), m(2022, 11)],
      ]),
    ).toBe(36 + 12);
  });

  it('computes total years from roles and skips internships', () => {
    const r = parseResume(
      [
        'EXPERIENCE',
        'Engineer | Acme | Jan 2020 – Dec 2021',
        '- Built things',
        'Engineer | Beta | Jun 2021 – Dec 2022',
        '- Shipped',
        'Intern | Gamma | Summer 2018',
        '- Helped',
      ].join('\n'),
      NOW,
    );
    expect(r.roles).toHaveLength(3);
    expect(r.totalMonths).toBe(36);
  });
});
