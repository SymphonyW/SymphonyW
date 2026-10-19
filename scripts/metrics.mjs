import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const themes = {
  dark: { bg: '#0d1117', text: '#e6edf3', muted: '#9da7b3', accent: '#39d353', grid: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'] },
  light: { bg: '#ffffff', text: '#1f2328', muted: '#59636e', accent: '#116329', grid: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] },
};
const levels = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const number = value => Number(value).toLocaleString('en-US');

export function summarize(days, today) {
  let run = 0, best = 0, total = 0, peak = 0;
  for (const day of days) {
    if (!Number.isInteger(day.contributionCount) || day.contributionCount < 0) throw new Error('Invalid contribution count');
    run = day.contributionCount > 0 ? run + 1 : 0;
    best = Math.max(best, run);
    total += day.contributionCount;
    peak = Math.max(peak, day.contributionCount);
  }
  // Today remains an open day: an active streak can end yesterday.
  let end = days.length - 1, current = 0;
  if (days[end]?.date === today && days[end].contributionCount === 0) end--;
  const yesterday = new Date(Date.parse(today) - DAY).toISOString().slice(0, 10);
  if ([today, yesterday].includes(days[end]?.date)) {
    for (let i = end; i >= 0 && days[i].contributionCount > 0; i--) current++;
  }
  return { current, best, peak, average: days.length ? (total / days.length).toFixed(1) : '0.0' };
}

export function languageStats(repositories) {
  const sizes = new Map();
  for (const repository of repositories) {
    for (const { size, node } of repository.languages.edges) sizes.set(node.name, (sizes.get(node.name) ?? 0) + size);
  }
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  return [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, size]) => ({ name, percent: total ? size / total * 100 : 0 }));
}

function svg(width, height, theme, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
<title id="title">${escape(title)}</title>
<rect width="100%" height="100%" fill="${theme.bg}"/>
<g font-family="ui-monospace, SFMono-Regular, Consolas, monospace" fill="${theme.text}">${body}</g>
</svg>\n`;
}

export function renderCalendar(weeks, days, today, mode) {
  const c = themes[mode], stats = summarize(days, today);
  const visible = new Set(days.map(day => day.date));
  const faces = [];
  const shade = (hex, ratio) => '#' + hex.slice(1).match(/../g).map(channel => Math.round(parseInt(channel, 16) * ratio).toString(16).padStart(2, '0')).join('');
  weeks.forEach((week, column) => week.contributionDays.forEach(day => {
    if (!visible.has(day.date)) return;
    const level = levels.indexOf(day.contributionLevel);
    if (level < 0) throw new Error('Unknown contribution level');
    const row = new Date(day.date + 'T00:00:00Z').getUTCDay();
    const x = 145 + column * 11.5 - row * 11.5, y = 36 + column * 2.7 + row * 7;
    const height = level ? 4 + level * 5 : 1.5, color = c.grid[level];
    faces.push(`<g><title>${day.date}: ${day.contributionCount} contributions</title>
<path fill="${shade(color, 0.7)}" d="M${x - 10},${y + 5 - height}l10,5v${height}l-10,-5z"/>
<path fill="${shade(color, 0.5)}" d="M${x},${y + 10 - height}l10,-5v${height}l-10,5z"/>
<path fill="${color}" d="M${x},${y - height}l10,5 -10,5 -10,-5z"/></g>`);
  }));
  const labels = [['Current streak', `${stats.current}d`], ['Best streak', `${stats.best}d`], ['Peak / day', number(stats.peak)], ['Avg / day', stats.average]];
  const footer = labels.map(([label, value], index) => `<text x="${105 + index * 205}" y="275" text-anchor="middle" fill="${c.muted}" font-size="12">${label}</text><text x="${105 + index * 205}" y="303" text-anchor="middle" fill="${c.accent}" font-size="23">${value}</text>`).join('');
  return svg(840, 345, c, 'Isometric contribution calendar and streak statistics', `${faces.join('')}
${footer}<text x="420" y="334" text-anchor="middle" fill="${c.muted}" font-size="10">CONTRIBUTIONS / PAST 365 DAYS</text>`);
}

export function renderStats(commits, repositories, mode) {
  const c = themes[mode], stars = repositories.reduce((sum, repo) => sum + repo.stargazerCount, 0);
  const languages = languageStats(repositories);
  const bars = languages.map(({ name, percent }, index) => {
    const y = 34 + index * 35;
    return `<text x="248" y="${y}" font-size="12">${escape(name)}</text><rect x="340" y="${y - 9}" width="190" height="6" rx="3" fill="${c.grid[0]}"/><rect x="340" y="${y - 9}" width="${(190 * percent / 100).toFixed(2)}" height="6" rx="3" fill="${c.accent}"/><text x="600" y="${y}" text-anchor="end" font-size="12" fill="${c.muted}">${percent.toFixed(1)}%</text>`;
  }).join('');
  return svg(640, 145, c, 'Commit contributions, public repository stars and top languages by code size', `
<text x="26" y="30" fill="${c.muted}" font-size="11">COMMITS / 365 DAYS</text><text x="26" y="59" font-size="25">${number(commits)}</text>
<text x="26" y="86" fill="${c.muted}" font-size="11">STARS / OWN PUBLIC REPOS</text><text x="26" y="113" font-size="25">${number(stars)}</text>
${bars || `<text x="248" y="65" fill="${c.muted}" font-size="12">No language data yet.</text>`}
<text x="248" y="132" fill="${c.muted}" font-size="9">TOP 3 / PUBLIC NON-FORK CODE SIZE</text>`);
}

async function graphql(query, variables) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'SymphonyW-profile' },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('; '));
  if (!result.data?.user) throw new Error('GitHub user data is missing');
  return result.data.user;
}

async function main() {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required; GitHub Actions provides it automatically.');
  const user = process.env.PROFILE_USER || 'SymphonyW';
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(user)) throw new Error('Invalid GitHub username');
  const now = new Date(), today = now.toISOString().slice(0, 10);
  const from = new Date(Date.parse(today) - 364 * DAY).toISOString();
  const { contributionsCollection: collection } = await graphql(`query($user:String!,$from:DateTime!,$to:DateTime!){
    user(login:$user){contributionsCollection(from:$from,to:$to){totalCommitContributions
      contributionCalendar{weeks{contributionDays{date contributionCount contributionLevel}}}}}
  }`, { user, from, to: now.toISOString() });
  const weeks = collection.contributionCalendar.weeks;
  const days = weeks.flatMap(week => week.contributionDays).filter(day => day.date >= from.slice(0, 10) && day.date <= today);
  if (days.length !== 365 || days.some((day, index) => index && Date.parse(day.date) - Date.parse(days[index - 1].date) !== DAY)) throw new Error('Incomplete contribution calendar; keeping the previous published images.');
  const repositories = [];
  let after = null;
  do {
    const result = await graphql(`query($user:String!,$after:String){user(login:$user){repositories(
      first:100,after:$after,privacy:PUBLIC,ownerAffiliations:[OWNER],isFork:false){
      nodes{stargazerCount languages(first:100,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}
      pageInfo{hasNextPage endCursor}}}}`, { user, after });
    repositories.push(...result.repositories.nodes);
    after = result.repositories.pageInfo.hasNextPage ? result.repositories.pageInfo.endCursor : null;
  } while (after);
  await mkdir('dist', { recursive: true });
  for (const mode of ['dark', 'light']) {
    await writeFile(`dist/calendar-${mode}.svg`, renderCalendar(weeks, days, today, mode));
    await writeFile(`dist/stats-${mode}.svg`, renderStats(collection.totalCommitContributions, repositories, mode));
  }
  console.log('Generated four themed SVGs; no personal profile fields were queried.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
