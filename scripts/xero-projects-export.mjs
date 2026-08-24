#!/usr/bin/env node
/**
 * Export all Xero Projects data before cancelling the add-on.
 *
 *   node scripts/xero-projects-export.mjs
 *
 * Writes ./xero-projects-export/<timestamp>/
 *   projects.csv  tasks.csv  time.csv  + raw .json of each
 *
 * Needs XERO_ACCESS_TOKEN with the projects.read scope, and XERO_TENANT_ID.
 * Read-only — makes no writes to Xero.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://api.xero.com/projects.xro/2.0';
const TOKEN = process.env.XERO_ACCESS_TOKEN;
const TENANT = process.env.XERO_TENANT_ID;

if (!TOKEN || !TENANT) {
  console.error('Set XERO_ACCESS_TOKEN and XERO_TENANT_ID first.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Xero-Tenant-Id': TENANT,
  Accept: 'application/json',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempt = 1) {
  const res = await fetch(url, { headers });

  if (res.status === 429) {
    // Xero: 60 calls/min, 5000/day. Retry-After is in seconds.
    const wait = (Number(res.headers.get('Retry-After')) || 60) + 1;
    console.log(`  rate limited, waiting ${wait}s`);
    await sleep(wait * 1000);
    return get(url, attempt);
  }
  if (res.status === 401) {
    throw new Error('401 — token expired (30 min) or missing projects.read scope.');
  }
  if (!res.ok) {
    if (attempt < 3) {
      await sleep(2000 * attempt);
      return get(url, attempt + 1);
    }
    throw new Error(`${res.status} ${res.statusText} on ${url}`);
  }
  return res.json();
}

/** Walks Xero's paged responses. Page size max 500. */
async function getAllPages(pathname) {
  const out = [];
  let page = 1;
  while (true) {
    const data = await get(`${BASE}${pathname}?page=${page}&pageSize=500`);
    const items = data.items || [];
    out.push(...items);
    const pagination = data.pagination || {};
    if (!pagination.pageCount || page >= pagination.pageCount) break;
    page += 1;
    await sleep(1100); // stay under 60/min
  }
  return out;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    // Xero returns money as { currency, value } — flatten to the number.
    if (typeof v === 'object') v = v.value ?? JSON.stringify(v);
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

async function main() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = path.join('xero-projects-export', stamp);
  await fs.mkdir(dir, { recursive: true });

  console.log('Fetching projects…');
  const projects = await getAllPages('/Projects');
  console.log(`  ${projects.length} projects`);

  const tasks = [];
  const time = [];

  for (const [i, p] of projects.entries()) {
    const label = `[${i + 1}/${projects.length}] ${p.name}`;
    console.log(label);

    for (const t of await getAllPages(`/Projects/${p.projectId}/Tasks`)) {
      tasks.push({ projectId: p.projectId, projectName: p.name, ...t });
    }
    await sleep(1100);

    for (const t of await getAllPages(`/Projects/${p.projectId}/Time`)) {
      time.push({ projectId: p.projectId, projectName: p.name, ...t });
    }
    await sleep(1100);
  }

  console.log(`  ${tasks.length} tasks, ${time.length} time entries`);

  const write = async (name, rows) => {
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(rows, null, 2));
    await fs.writeFile(path.join(dir, `${name}.csv`), toCsv(rows));
  };

  await write('projects', projects);
  await write('tasks', tasks);
  await write('time', time);

  const unbilled = projects.filter(
    (p) =>
      (p.expenseAmountToBeInvoiced?.value ?? 0) > 0 ||
      (p.taskAmountToBeInvoiced?.value ?? 0) > 0
  );

  console.log(`\nDone → ${dir}`);
  console.log(`${unbilled.length} projects carry unbilled amounts:`);
  for (const p of unbilled) {
    const task = p.taskAmountToBeInvoiced?.value ?? 0;
    const exp = p.expenseAmountToBeInvoiced?.value ?? 0;
    console.log(`  ${p.name}: task ${task}, expense ${exp}`);
  }
}

main().catch((e) => {
  console.error('\nFailed:', e.message);
  process.exit(1);
});
