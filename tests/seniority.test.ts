import { describe, expect, it } from 'vitest';
import { classifyTitle } from '../src/engine/titles';

describe('title → family and level', () => {
  it.each([
    ['Product Manager', 'product', 2],
    ['Senior Product Manager, Payments', 'product', 3],
    ['Associate Product Manager', 'product', 1],
    ['Group Product Manager', 'product', 4],
    ['Principal Product Manager', 'product', 5],
    ['Director of Product', 'product', 7],
    ['VP of Product', 'product', 8],
    ['Software Engineer II', 'engineering', 2],
    ['Senior Software Engineer', 'engineering', 3],
    ['Staff Engineer', 'engineering', 4],
    ['Engineering Manager', 'engineering', 6],
    ['Software Engineering Intern', 'engineering', 0],
    ['Product Designer', 'design', 2],
    ['Lead UX Designer', 'design', 4],
    ['Head of Design', 'design', 7],
    ['Data Analyst', 'data', 2],
    ['Senior Data Scientist', 'data', 3],
    ['Machine Learning Engineer', 'data', 2],
    ['Marketing Manager', 'marketing', 2],
    ['Account Executive', 'sales', 2],
    ['Technical Program Manager', 'ops', 2],
    ['Financial Analyst', 'finance', 2],
    ['Chief Technology Officer', 'engineering', 8],
  ])('%s', (title, family, level) => {
    expect(classifyTitle(title)).toEqual({ family, level });
  });
});
