import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputPath = process.argv[2];

if (!outputPath) {
  throw new Error('Usage: node .github/scripts/coverage-report.mjs <output-path>');
}

const reports = [
  ['Client', path.join(root, 'client/coverage/coverage-summary.json')],
  ['Server', path.join(root, 'server/coverage/coverage-summary.json')],
].map(([name, reportPath]) => {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  return { name, totals: report.total };
});

const metrics = ['lines', 'statements', 'functions', 'branches'];
const combined = Object.fromEntries(
  metrics.map((metric) => [
    metric,
    reports.reduce(
      (sum, report) => ({
        total: sum.total + report.totals[metric].total,
        covered: sum.covered + report.totals[metric].covered,
      }),
      { total: 0, covered: 0 },
    ),
  ]),
);

function percentage(metric) {
  if (metric.total === 0) return '—';
  const truncated = Math.floor((metric.covered / metric.total) * 10_000) / 100;
  return `${truncated.toFixed(2)}%`;
}

function row(name, totals) {
  return `| ${name} | ${metrics.map((metric) => percentage(totals[metric])).join(' | ')} |`;
}

const sha = process.env.GITHUB_SHA?.slice(0, 7);
const lines = [
  '<!-- yarukoto-coverage -->',
  '## Code coverage',
  '',
  '| Area | Lines | Statements | Functions | Branches |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...reports.map((report) => row(report.name, report.totals)),
  row('Combined', combined),
  '',
  '_Scope: all client source and server source except the server bootstrap entry point._',
  sha ? `_Commit \`${sha}\`._` : '_Generated from the current checkout._',
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines);
}

process.stdout.write(lines);
