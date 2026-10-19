import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { summarize, languageStats, renderCalendar, renderStats } from './metrics.mjs';

const days = [2, 4, 0, 3, 1, 0].map((count, index) => ({ date: `2026-10-${14 + index}`, contributionCount: count, contributionLevel: count ? 'SECOND_QUARTILE' : 'NONE' }));
assert.deepEqual(summarize(days, '2026-10-19'), { current: 2, best: 2, peak: 4, average: '1.7' });
assert.equal(summarize(days.slice(0, -1), '2026-10-18').current, 2);
assert.equal(summarize(days, '2026-10-21').current, 0);
assert.deepEqual(summarize([], '2026-10-19'), { current: 0, best: 0, peak: 0, average: '0.0' });
assert.throws(() => summarize([{ contributionCount: -1 }], '2026-10-19'));
const repositories = [{ stargazerCount: 8, languages: { edges: [{ size: 60, node: { name: 'C++' } }, { size: 30, node: { name: 'Go' } }, { size: 9, node: { name: 'Python' } }, { size: 1, node: { name: 'HTML' } }] } }];
assert.deepEqual(languageStats(repositories).map(item => item.percent), [60, 30, 9]);
assert.deepEqual(languageStats([]), []);
for (const mode of ['dark', 'light']) {
  const calendar = renderCalendar([{ contributionDays: days }], days, '2026-10-19', mode);
  assert(calendar.includes('Current streak') && calendar.includes('>2d</text>'));
  assert(!/NaN|Infinity|undefined/.test(calendar));
  assert(renderStats(12, repositories, mode).includes('C++'));
  assert(renderStats(0, [], mode).includes('No language data yet.'));
  const hostile = [{ stargazerCount: 0, languages: { edges: [{ size: 1, node: { name: '<script>' } }] } }];
  assert(!renderStats(0, hostile, mode).includes('<script>'));
}
const root = new URL('../', import.meta.url);
const readme = await readFile(new URL('README.md', root), 'utf8');
const snake = await readFile(new URL('.github/workflows/snake.yml', root), 'utf8');
const metrics = await readFile(new URL('.github/workflows/metrics.yml', root), 'utf8');
for (const workflow of [snake, metrics]) {
  assert(workflow.includes('contents: write') && workflow.includes('workflow_dispatch:'));
  assert.equal([...workflow.matchAll(/cron:/g)].length, 1);
  assert(!/METRICS_TOKEN|PAT_TOKEN|@master|@latest/.test(workflow));
}
for (const match of readme.matchAll(/(?:src|srcset)="([^"]+)"/g)) {
  const path = match[1];
  if (!path.startsWith('https://')) { await access(new URL(path, root)); continue; }
  const url = new URL(path), [, owner, repo, branch, file] = url.pathname.split('/');
  assert.equal(url.hostname, 'raw.githubusercontent.com');
  assert.equal(`${owner}/${repo}`, 'SymphonyW/SymphonyW');
  const workflow = branch === 'snake' ? snake : metrics;
  assert(workflow.includes(`target_branch: ${branch}`) && workflow.includes('build_dir: dist'));
  if (branch === 'snake') assert(workflow.includes(`dist/${file}?`));
  else assert(['calendar-dark.svg', 'calendar-light.svg', 'stats-dark.svg', 'stats-light.svg'].includes(file));
}
assert(!/About Me|Wu Xinzhan|shields\.io|visitor|trophy|symphonyw\.github\.io/i.test(readme));
console.log('PASS: streak edge cases, averages, language shares, SVG escaping, permissions, schedules, and README output paths.');
