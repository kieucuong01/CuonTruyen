import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const mojibakePatterns = [
  /\u00c3/g,
  /\u00c4/g,
  /\u00e1\u00bb/g,
  /\u00e1\u00ba/g,
  /\u00c6/g,
  /\u00c2/g,
  /\u00c3\u0192/g,
  /\u00c3\u201e/g,
  /\u00c3\u00a1\u00c2\u00bb/g,
  /\u00c3\u00a1\u00c2\u00ba/g,
  /\u00c3\u2020/g,
  /\u00c3\u201a/g,
  /Cu\?/g,
  /\?\?c/g,
  /Chi ti\?/g,
  /Lich su/g,
  /Tieu de/g,
  /Trang thai/g
];

const DEFAULT_TARGETS = ['public', 'server', 'docs', 'README.md', 'AGENTS.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'data']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.css', '.md', '.json', '.txt']);

async function walk(target, files = []) {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return files;
  }
  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(path.basename(target))) return files;
    const entries = await fs.readdir(target);
    for (const entry of entries) await walk(path.join(target, entry), files);
    return files;
  }
  if (TEXT_EXTENSIONS.has(path.extname(target))) files.push(target);
  return files;
}

export async function findEncodingIssues({ cwd = process.cwd(), targets = DEFAULT_TARGETS } = {}) {
  const files = [];
  for (const target of targets) await walk(path.join(cwd, target), files);
  const issues = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (mojibakePatterns.some((pattern) => pattern.test(line))) {
        mojibakePatterns.forEach((pattern) => { pattern.lastIndex = 0; });
        issues.push({
          file: path.relative(cwd, file),
          line: index + 1,
          text: line.trim().slice(0, 180)
        });
      }
    });
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = await findEncodingIssues();
  if (issues.length) {
    console.error('Potential mojibake / broken Vietnamese text found:');
    for (const issue of issues) console.error(`${issue.file}:${issue.line} ${issue.text}`);
    process.exitCode = 1;
  }
}
