const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const workflow = process.env.WORKFLOW_FILE;
const maxDepth = Number(process.env.MAX_QUEUE_DEPTH || 100);
if (!token || !repository || !workflow || !Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 100) {
  process.stderr.write('queue guard configuration is invalid\n');
  process.exit(2);
}

const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?status=queued&per_page=100`;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8_000);
let response;
try {
  response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2026-03-10',
      'user-agent': 'fallback-rule-learning-queue-guard/1'
    },
    redirect: 'manual',
    signal: controller.signal
  });
} catch {
  process.stderr.write('queue guard request failed\n');
  process.exit(1);
} finally {
  clearTimeout(timer);
}
if (response.status >= 300 && response.status < 400) {
  process.stderr.write('queue guard redirect is forbidden\n');
  process.exit(1);
}
if (!response.ok) {
  process.stderr.write('queue guard response is invalid\n');
  process.exit(1);
}
const body = await response.json();
const queued = Array.isArray(body.workflow_runs) ? body.workflow_runs.length : -1;
if (queued < 0 || queued >= maxDepth) {
  process.stderr.write('workflow queue limit reached\n');
  process.exit(1);
}
process.stdout.write(`queue depth within limit: ${queued}\n`);
