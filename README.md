# Resume Match Score

**See how your resume reads to a recruiter.** Paste a job posting, add your resume, and get an overall match score, a breakdown by dimension with cited evidence, and the specific edits that would raise it.

**Live:** https://chintanjv.github.io/resume-match-score/

Everything runs in your browser. There is no server, no account, no analytics and no third-party request. Your resume never leaves your device.

> The name lives in one place: `src/brand.ts` (`APP_NAME`, `TAGLINE`, `PAGE_TITLE`, `DESCRIPTION`, `AUTHOR`). The build injects it into `index.html`.

## How it works

1. **The job posting is cleaned before it is scored.** The text is split into blocks using headings, bullets and blank lines. A rule-based classifier then labels each block, using a heading/body lexicon plus position cues:
   - **Scored:** title, role summary, responsibilities, required qualifications, preferred qualifications.
   - **Extracted, not scored:** location, work arrangement, salary, employment type.
   - **Ignored:** about-the-company, mission, benefits, EEO and legal text, accommodations, how-to-apply, privacy notices, page boilerplate.

   You can see and toggle the blocks under **What we analyzed**, and the score recomputes instantly.

2. **Qualifications become atomic requirements.** For example, "5+ years of PM experience in fintech or payments" becomes two items: _5+ years in product management_ and _fintech/payments experience_. Each item is a years, skill, domain, degree, certification or free-text clause requirement. "Or" lists and "such as" examples become any-of items, and inline cues ("a plus", "ideally") mark an item as preferred.
3. **The resume is parsed into sections, roles, dates and bullets.** Date ranges such as `Jan 2020 – Present`, `2019–2021`, `03/2018 - 06/2020`, `Summer 2017`, `Q3 2021` and `'19 – '21` are merged into total and relevant years.
4. **Matching is concept-based.** Synonyms from a 1,500+ entry skills taxonomy collapse to one concept: _A/B testing_ = _split tests_ = _experimentation_. Specific tools satisfy their parent skill (Postgres → SQL, Kafka → message queues). Free-text requirements are matched against bullets with BM25.
5. **Top fixes are counterfactual.** For each unmet requirement or missing keyword, the engine re-scores as if you had added that evidence, then ranks the edits by actual score gain.

### Scoring dimensions

| #   | Dimension                  | Weight   | What it measures                                                                                                                                                                                                                                                         |
| --- | -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Keyword match              | 20%      | The posting's hard skills and tools, weighted by frequency and by whether they appear in the required section. A skill counts fully when it appears in a bullet and half when it's only in your Skills list. Recent roles weigh 1.0×; roles over 5 years old weigh 0.7×. |
| 2   | Required qualifications    | 25%      | Each required item scored Meets (1), Partial (0.5) or Missing (0), with the resume line that supports it. Degree and certification items count here.                                                                                                                     |
| 3   | Preferred qualifications   | 8%       | Same method, applied to preferred items.                                                                                                                                                                                                                                 |
| 4   | Years of experience        | 15%      | Relevant years against the minimum: at or above it = 100, 1 year short = 75, 2 years short = 50, 3 years short = 25. Notes when you may read as overqualified.                                                                                                           |
| 5   | Seniority & title fit      | 8%       | Level ladder (Intern … VP) and function family (product, engineering, design, data, marketing, sales, ops, finance).                                                                                                                                                     |
| 6   | Domain match               | 7%       | Industry overlap (fintech, B2B SaaS, health, marketplaces …), weighted by how often the posting mentions each.                                                                                                                                                           |
| 7   | Responsibilities alignment | 10%      | Each responsibility against your closest bullet: action-verb class plus object overlap.                                                                                                                                                                                  |
| 8   | Impact & evidence          | 7%       | The share of bullets with quantified outcomes, and skills demonstrated vs only listed.                                                                                                                                                                                   |
| 9   | Education & certifications | in #2    | Shown separately; N/A when the posting doesn't specify.                                                                                                                                                                                                                  |
| 10  | ATS readability            | separate | Contact info, standard headings, parseable dates, length, bullet count and keyword stuffing. Subtracts 5 points from the overall below 60, and 10 below 40.                                                                                                              |

Any dimension that doesn't apply (N/A) is dropped, and the remaining weights are renormalized.

- **Grade:** A ≥ 85 with required ≥ 90% · B ≥ 70 with required ≥ 75% · C ≥ 50 · D < 50. If required coverage is under 60%, the grade can't exceed C.
- **Labels:** Strong (≥ 80) · Good (≥ 65) · Partial (≥ 45) · Limited.
- **Knockout banners:** location or work-arrangement mismatch, work authorization or sponsorship language, and security clearance or professional licenses the resume doesn't mention. Banners are shown but never change the score.

## Privacy

- All parsing and scoring happens locally. Scoring runs in a Web Worker; PDF and DOCX parsers load only when you drop a file of that type.
- A Content-Security-Policy restricts every fetch to the site itself. Fonts are self-hosted, and nothing is stored, logged or sent.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: unit, golden, contrast and perf tests
npm run lint       # ESLint + Prettier check
npm run build      # type-check + production build
npm run size       # gzipped size report vs budgets (initial JS ≤ 60 KB, CSS ≤ 15 KB)
```

Fixtures live in `/fixtures`: four job postings that include company, benefits and EEO noise, plus four matching resumes. The golden tests check four things:

- Each matched pair scores ≥ 75.
- Mismatched pairs score ≤ 45.
- Adding company or benefits noise moves the score by ≤ 2 points.
- Text contrast meets WCAG AA on glass surfaces.

## Tuning

- **`src/engine/config.ts`:** every weight, threshold and calibration lives here. It covers dimension weights, years gap scores, seniority penalties, BM25 parameters, clause thresholds, ATS checks and stuffing limits, grade cutoffs and the number of fixes.
- **`src/engine/data/*.json`:** the lexicons.

  | File                               | What it holds                                                                                                                                                                                                       |
  | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `skills.json`                      | The taxonomy. Each entry has a name `n`, category `c`, aliases `a`, parents `p` (`;`-separated) and flags `f`. The `cs` flag means case-sensitive; `ctx` means the entry needs programming context (e.g. Go, R, C). |
  | `domains.json`                     | Industries, with aliases and known company names.                                                                                                                                                                   |
  | `jd-headings.json`                 | Block heading and body cues.                                                                                                                                                                                        |
  | `resume-headings.json`             | Resume section headings.                                                                                                                                                                                            |
  | `titles.json`                      | Function families, levels, and the skills implied by a job title.                                                                                                                                                   |
  | `degrees.json`, `certs.json`       | Degrees and certifications.                                                                                                                                                                                         |
  | `verbs.json`, `soft-evidence.json` | Action-verb classes, and how soft skills are evidenced.                                                                                                                                                             |
  | `stopwords.json`                   | Stopwords and generic terms.                                                                                                                                                                                        |

- After editing the taxonomy, run `npm test`. The taxonomy test catches alias collisions, missing parents and the 80 KB size budget.

## Deploy to GitHub Pages

1. Create a GitHub repository and push this project to `main`:
   ```bash
   git remote add origin https://github.com/<you>/resume-match-score.git
   git add -A && git commit -m "Initial commit" && git push -u origin main
   ```
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which lints, tests, builds, checks the size budget and publishes `dist/`. The workflow sets Vite's `base` to `/<repo-name>/`, so the project page URL keeps working if you rename the repository.

The footer credit comes from `AUTHOR` in `src/brand.ts`.

The workflow also sets `SITE_URL` (`https://<owner>.github.io/<repo>/`), so link previews (`public/og.jpg`, 1200×630), the canonical URL and the structured data use absolute URLs. If you move to a custom domain, set `SITE_URL` to that domain in the workflow.

## Stack

Vite + TypeScript (strict). There is no UI framework: the UI is vanilla modules with plain CSS. Runtime dependencies are `pdfjs-dist` and `mammoth`, and each loads lazily with its file type. The stemmer, BM25, date parser and classifier are implemented inline. The typeface is Outfit (SIL OFL, self-hosted, variable weight).

## Roadmap (not in v1)

- An optional in-browser embedding model for semantic matching
- An optional bring-your-own-API-key LLM mode for rewrite suggestions
- OCR for scanned PDFs
- Saved history of past analyses

## License

MIT. See [LICENSE](LICENSE). Outfit is licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
