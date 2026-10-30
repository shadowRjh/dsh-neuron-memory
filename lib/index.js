/**
 * dsh-neuron-memory —— 仿神经元记忆框架（宿主半）。
 *
 * 输入：一轮对话结束 → 自动归类写入「海马体」→ 夜巡把海马体总结给 agent →
 *       agent 分类归档进「记忆库」。
 * 输出：用户文本唤起 → 按相关性筛选 → 只注入命中的记忆（非全量）。
 * 遗忘：艾宾浩斯半衰期 + 分层生命周期；被想起（touch）延长寿命 = 间隔重复。
 *
 * 存储（全部本地，JSONL，可审计）：
 *   ~/.dsh/memories/.neuron/
 *     hippocampus.jsonl   原始片段（未归档）
 *     entries.jsonl       记忆库（含池、权重、生命期、召回次数）
 *     config.json         可调参数
 *     patrol/YYYY-MM-DD.md 夜巡报告
 *
 * 只读写自己的目录；不联网、不调模型。
 *
 * @module dsh-neuron-memory
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname, platform, release, cpus, totalmem, freemem, loadavg, uptime } from 'node:os';
import { createHash } from 'node:crypto';

export const name = 'neuron-memory';
export const inject = ['tools', 'systemPrompt'];

const HOME = process.env.NEURON_HOME || join(homedir(), '.dsh', 'memories', '.neuron');
const HIPPO = join(HOME, 'hippocampus.jsonl');
const ENTRIES = join(HOME, 'entries.jsonl');
const CONFIG = join(HOME, 'config.json');
const PATROL_DIR = join(HOME, 'patrol');
/** 旧 dsh-chain 的数据文件；首次启动时一次性导入，避免换插件就「失忆」。 */
const LEGACY_CHAIN = join(homedir(), '.dsh', 'memories', '.chain-shared', 'chains.jsonl');

/* 全机数据源（会话 / 花费 / 插件 / 系统），与记忆节点一起画进 3D 星云 */
const DSH_HOME = join(homedir(), '.dsh');
const PROJ_CACHE = join(DSH_HOME, 'storages', 'session_projcache', 'sessions');
const USAGE_FILE = join(DSH_HOME, '.dshw-usage.json');
const PROFILE_DIR = join(DSH_HOME, 'profiles', 'desktop');
const PLUGINS_DIR = join(DSH_HOME, 'plugins');

/* ─────────────────────────── 默认参数（全部可改） ─────────────────────────── */

const DEFAULT_CONFIG = {
  version: 1,
  capture: { enabled: true, includeAssistant: true, maxHippocampus: 400, maxChars: 1200 },
  injection: { budgetChars: 900, maxItems: 6, minWeight: 0.08, recentLimit: 2 },
  patrol: { hour: 3, minute: 10, autoArchive: true, maxArchivePerRun: 24 },
  pools: {
    core: { label: '核心', color: '#ffd24a', halfLifeDays: 60, graceDays: 20, archiveDays: 180, keywords: ['我是', '我喜欢', '我的', '记住', '我们', '习惯', '偏好'] },
    fact: { label: '事实', color: '#b9a6ff', halfLifeDays: 45, graceDays: 10, archiveDays: 120, keywords: ['版本', '日期', '地址', '路径', '端口', '配置', '是', '有'] },
    skill: { label: '技能', color: '#59d98e', halfLifeDays: 90, graceDays: 20, archiveDays: 365, keywords: ['步骤', '方法', '命令', '安装', '如何', '脚本', '流程'] },
    daily: { label: '日常', color: '#7fd4ff', halfLifeDays: 20, graceDays: 5, archiveDays: 90, keywords: ['今天', '刚才', '等下', '明天', '最近'] },
    emotion: { label: '情绪', color: '#ff7fb4', halfLifeDays: 3, graceDays: 1, archiveDays: 14, keywords: ['开心', '难过', '生气', '担心', '喜欢', '讨厌', '焦虑'] },
  },
};

/* ─────────────────────────────── 工具函数 ─────────────────────────────── */

const iso = () => new Date().toISOString();
const id = () => 'n_' + Math.random().toString(16).slice(2, 10);
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const days = (from, to = Date.now()) => Math.max(0, (to - Date.parse(from || 0)) / 86400000);

function ensureHome() {
  try {
    mkdirSync(HOME, { recursive: true });
    mkdirSync(PATROL_DIR, { recursive: true });
  } catch { /* ignore */ }
}

function loadConfig() {
  ensureHome();
  const stored = readJson(CONFIG, null);
  if (!stored || typeof stored !== 'object') return structuredClone(DEFAULT_CONFIG);
  const merged = structuredClone(DEFAULT_CONFIG);
  for (const [k, v] of Object.entries(stored)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object') {
      merged[k] = { ...merged[k], ...v };
      if (k === 'pools') {
        for (const [p, def] of Object.entries(merged.pools)) {
          if (v[p] && typeof v[p] === 'object') merged.pools[p] = { ...def, ...v[p] };
        }
      }
    } else {
      merged[k] = v;
    }
  }
  return merged;
}

function saveConfig(cfg) {
  ensureHome();
  try { writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), 'utf8'); return true; } catch { return false; }
}

function readJson(path, fallback) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback; } catch { return fallback; }
}

function readJsonl(path) {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function writeJsonl(path, rows) {
  ensureHome();
  try { writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8'); return true; } catch { return false; }
}

function appendJsonl(path, row) {
  ensureHome();
  try { appendFileSync(path, JSON.stringify(row) + '\n', 'utf8'); return true; } catch { return false; }
}

/** 中文按二元组、英文按词切分（不依赖 jieba，零安装）。 */
function tokens(text) {
  const s = String(text || '').toLowerCase();
  const out = [];
  const ascii = s.match(/[a-z0-9_.\/:-]{2,}/g) || [];
  out.push(...ascii);
  const cjk = s.replace(/[^\u4e00-\u9fff]+/g, ' ').split(/\s+/).filter(Boolean);
  for (const seg of cjk) {
    if (seg.length === 1) out.push(seg);
    for (let i = 0; i + 1 < seg.length; i += 1) out.push(seg.slice(i, i + 2));
  }
  return out;
}

function overlapScore(queryTokens, text) {
  if (queryTokens.length === 0) return 0;
  const set = new Set(tokens(text));
  let hit = 0;
  for (const t of new Set(queryTokens)) if (set.has(t)) hit += 1;
  return hit / Math.min(12, Math.max(3, queryTokens.length));
}

function poolOf(text, cfg) {
  let best = 'fact';
  let bestScore = 0;
  for (const [key, def] of Object.entries(cfg.pools)) {
    let score = 0;
    for (const kw of def.keywords || []) if (String(text).includes(kw)) score += 1;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best;
}

/** 艾宾浩斯式有效权重：宽限期后按半衰期衰减。 */
function effectiveWeight(entry, cfg, now = Date.now()) {
  const def = cfg.pools[entry.pool] || cfg.pools.fact;
  const anchor = entry.lastTouched || entry.ts;
  const age = days(anchor, now);
  const raw = Math.max(0, Math.min(1, Number(entry.rawWeight ?? entry.weight ?? 0.5)));
  if (age <= def.graceDays) return raw;
  return raw * Math.pow(0.5, (age - def.graceDays) / def.halfLifeDays);
}

function lifecycle(entry, cfg, now = Date.now()) {
  if (entry.status === 'archived') return 'archived';
  const def = cfg.pools[entry.pool] || cfg.pools.fact;
  const age = days(entry.lastTouched || entry.ts, now);
  if (age >= def.archiveDays) return 'archived';
  if (age >= def.halfLifeDays) return 'echo';
  if (age >= def.graceDays) return 'settling';
  return 'active';
}

function allEntries() {
  return readJsonl(ENTRIES);
}

/** 首次启动：把旧 dsh-chain 的判断导入记忆库（只做一次，条目不重复导入）。 */
function importLegacyChain(cfg) {
  try {
    if (existsSync(ENTRIES) || !existsSync(LEGACY_CHAIN)) return 0;
    const rows = readJsonl(LEGACY_CHAIN).filter((r) => typeof r.judgement === 'string' && r.judgement !== '');
    if (rows.length === 0) return 0;
    const map = { 核心: 'core', 事实: 'fact', 技能: 'skill', 核心日常: 'daily', 片面日常: 'daily', 情绪: 'emotion', 海马体: 'daily' };
    const entries = rows.map((r) => {
      const tags = Array.isArray(r.tags) ? r.tags : [];
      const tagPool = tags.map((t) => map[t]).find(Boolean);
      const text = String(r.judgement) + (r.conclusion ? ' → ' + String(r.conclusion) : '');
      return {
        id: r.id && String(r.id).startsWith('c_') ? r.id : id(),
        ts: r.ts || iso(),
        text,
        pool: tagPool || poolOf(text, cfg),
        role: 'assistant',
        session: '',
        rawWeight: Math.max(0.3, Math.min(1, Number(r.weight) || 0.5)),
        weight: Math.max(0.3, Math.min(1, Number(r.weight) || 0.5)),
        lastTouched: r.lastTouched || r.ts || iso(),
        recalls: 0,
        status: 'active',
        source: 'legacy-chain',
      };
    });
    ensureHome();
    writeJsonl(ENTRIES, entries);
    writeFileSync(join(HOME, 'imported-legacy-chain.json'), JSON.stringify({ at: iso(), count: entries.length }), 'utf8');
    return entries.length;
  } catch {
    return 0;
  }
}

function saveEntries(rows) {
  return writeJsonl(ENTRIES, rows);
}

/* ───────────────────────────── 海马体（写入） ───────────────────────────── */

const recentHashes = new Map();

function capture(scope, cfg) {
  if (!cfg.capture.enabled) return;
  try {
    const session = scope?.session;
    if (!session || typeof session.deriveMessages !== 'function') return;
    const messages = session.deriveMessages();
    if (!Array.isArray(messages) || messages.length === 0) return;
    const picked = [];
    for (let i = messages.length - 1; i >= 0 && picked.length < 4; i -= 1) {
      const m = messages[i];
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
      let raw = typeof m.content === 'string' ? m.content : '';
      if (raw === '' && Array.isArray(m.content)) {
        raw = m.content.filter((p) => p && typeof p === 'object' && p.type === 'text').map((p) => p.text || '').join('\n');
      }
      const text = raw.split(/\r?\n/)
        .filter((l) => !/^(Time sampled|Current runtime context|Browser file zone|Browser time zone|Elapsed since|Tokens prefixed)/.test(l.trim()))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();
      if (text === '') continue;
      if (/^<(system-reminder|skill|available_skills|local-command)/i.test(text)) continue;
      if (m.role === 'assistant' && !cfg.capture.includeAssistant) continue;
      picked.push({ role: m.role, text: text.slice(0, cfg.capture.maxChars) });
    }
    if (picked.length === 0) return;
    let appended = 0;
    for (const item of picked) {
      const h = hash(item.role + '|' + item.text);
      if (recentHashes.has(h)) continue;
      recentHashes.set(h, Date.now());
      if (recentHashes.size > 400) recentHashes.clear();
      const ok = appendJsonl(HIPPO, {
        id: id(),
        ts: iso(),
        session: String(scope?.id || ''),
        role: item.role,
        text: item.text,
        pool: poolOf(item.text, cfg),
        status: 'pending',
      });
      if (ok) appended += 1;
    }
    // 防膨胀：只在超限时裁剪一次（避免每轮重写）
    if (appended > 0) {
      const rows = readJsonl(HIPPO);
      if (rows.length > cfg.capture.maxHippocampus) writeJsonl(HIPPO, rows.slice(-cfg.capture.maxHippocampus));
    }
  } catch { /* 捕获失败不影响本轮 */ }
}

/* ───────────────────────────── 召回（读出） ───────────────────────────── */

function recall(query, cfg) {
  const now = Date.now();
  const qTokens = tokens(query);
  const scored = [];
  for (const entry of allEntries()) {
    const state = lifecycle(entry, cfg, now);
    if (state === 'archived') continue;
    const weight = effectiveWeight(entry, cfg, now);
    if (weight < cfg.injection.minWeight) continue;
    const score = overlapScore(qTokens, entry.text);
    if (qTokens.length > 0 && score <= 0) continue;
    scored.push({ entry, score, weight, state, rank: score * 0.75 + weight * 0.35 });
  }
  scored.sort((a, b) => b.rank - a.rank);
  return scored.slice(0, cfg.injection.maxItems);
}

function touch(ids, cfg) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const rows = allEntries();
  let n = 0;
  const now = iso();
  for (const row of rows) {
    if (!ids.includes(row.id)) continue;
    row.rawWeight = Math.min(1, Number(row.rawWeight ?? row.weight ?? 0.5) + 0.15);
    row.weight = row.rawWeight;
    row.lastTouched = now;
    row.recalls = (Number(row.recalls) || 0) + 1;
    if (row.status === 'archived') row.status = 'active';
    n += 1;
  }
  if (n > 0) saveEntries(rows);
  return n;
}

function ageLabel(ts) {
  const d = days(ts);
  if (d < 1 / 24) return '刚刚';
  if (d < 1) return Math.round(d * 24) + ' 小时前';
  return Math.round(d) + ' 天前';
}

/* ───────────────────────────── 夜巡（睡眠） ───────────────────────────── */

let lastPatrolDate = '';

function todayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function patrol(force, cfg, ctx) {
  ensureHome();
  const today = todayYmd();
  const now = new Date();
  if (!force) {
    const after = now.getHours() > cfg.patrol.hour || (now.getHours() === cfg.patrol.hour && now.getMinutes() >= cfg.patrol.minute);
    if (!after || lastPatrolDate === today) return null;
  }
  lastPatrolDate = today;

  const hippo = readJsonl(HIPPO);
  const pending = hippo.filter((r) => r.status !== 'archived');
  const entries = allEntries();

  // 1) 归档：把海马体里还没归档的片段按关键词分池，转成记忆库条目
  const toArchive = cfg.patrol.autoArchive ? pending.slice(0, cfg.patrol.maxArchivePerRun) : [];
  for (const frag of toArchive) {
    const pool = frag.pool || poolOf(frag.text, cfg);
    entries.push({
      id: frag.id,
      ts: frag.ts,
      text: frag.text,
      pool,
      role: frag.role,
      session: frag.session,
      rawWeight: 0.55,
      weight: 0.55,
      lastTouched: frag.ts,
      recalls: 0,
      status: 'active',
      source: 'patrol',
    });
    frag.status = 'archived';
  }
  if (toArchive.length > 0) {
    writeJsonl(HIPPO, hippo);
    saveEntries(entries);
  }

  // 2) 生命周期清扫：低于阈值的标记归档
  const nowMs = Date.now();
  let retired = 0;
  for (const row of entries) {
    if (row.status === 'archived') continue;
    if (lifecycle(row, cfg, nowMs) === 'archived') { row.status = 'archived'; retired += 1; }
  }
  if (retired > 0) saveEntries(entries);

  // 3) 报告
  const byPool = {};
  for (const row of entries) {
    if (row.status === 'archived') continue;
    byPool[row.pool] = (byPool[row.pool] || 0) + 1;
  }
  const lines = [
    `# 夜巡报告 ${today}`,
    '',
    `- 海马体待归档：${pending.length}（本次归档 ${toArchive.length}）`,
    `- 记忆库活跃：${entries.filter((e) => e.status !== 'archived').length}（本次生命周期归档 ${retired}）`,
    `- 分池：${Object.entries(byPool).map(([k, v]) => `${cfg.pools[k]?.label || k} ${v}`).join(' / ')}`,
    '',
    '## 本次归档',
  ];
  for (const frag of toArchive) lines.push(`- [${cfg.pools[frag.pool]?.label || frag.pool}] ${String(frag.text).slice(0, 160)}`);
  if (toArchive.length === 0) lines.push('（无）');
  const reportPath = join(PATROL_DIR, `${today}.md`);
  try { writeFileSync(reportPath, lines.join('\n'), 'utf8'); } catch { /* ignore */ }
  if (ctx?.logger?.info) ctx.logger.info(`[neuron-memory] patrol ${today}: archived=${toArchive.length} retired=${retired}`);
  return { date: today, archived: toArchive.length, retired, reportPath };
}

/* ───────────────────────────── 注入（输出） ───────────────────────────── */

function buildInjection(scope, cfg) {
  const messages = (() => {
    try { return scope?.session?.deriveMessages?.() || []; } catch { return []; }
  })();
  let said = '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== 'user') continue;
    let raw = typeof m.content === 'string' ? m.content : '';
    if (raw === '' && Array.isArray(m.content)) {
      raw = m.content.filter((p) => p && p.type === 'text').map((p) => p.text || '').join('\n');
    }
    const cleaned = raw.split(/\r?\n/).filter((l) => !/^(Time sampled|Current runtime context|Browser time zone|Elapsed since|Tokens prefixed)/.test(l.trim())).join('\n').trim();
    if (cleaned !== '' && !/^<(system-reminder|skill|available_skills)/i.test(cleaned)) { said = cleaned; break; }
  }
  const hits = recall(said, cfg);
  const parts = [];
  if (hits.length > 0) {
    const lines = [];
    let used = 0;
    for (const h of hits) {
      const def = cfg.pools[h.entry.pool] || cfg.pools.fact;
      const line = `- [${def.label} · ${ageLabel(h.entry.lastTouched || h.entry.ts)} · 权重 ${h.weight.toFixed(2)}] ${String(h.entry.text).slice(0, 180)}`;
      if (used + line.length > cfg.injection.budgetChars) break;
      used += line.length;
      lines.push(line);
    }
    if (lines.length > 0) {
      parts.push('### 神经元记忆（相关命中）\n' + lines.join('\n'));
      // 被想起 = 间隔重复：延长寿命（异步，不阻塞本轮）
      queueMicrotask(() => { try { touch(hits.map((h) => h.entry.id), cfg); } catch { /* ignore */ } });
    }
  }
  const pending = readJsonl(HIPPO).filter((r) => r.status !== 'archived').length;
  if (pending > 0) {
    parts.push(`### 海马体（${pending} 条待归档）\n这轮结束前若其中有值得长期保留的，用 neuron_archive 归档到对应池；不归档的会在夜巡时按关键词自动归类。`);
  }
  return parts.join('\n\n');
}

/* ─────────────────────────────── 工具 ─────────────────────────────── */

const textBlock = (text) => [{ type: 'text', text: String(text ?? '') }];

function toolStatus() {
  return {
    name: 'neuron_status',
    description: 'Read the neuron-memory state: pool counts, weights/lifecycle distribution, hippocampus backlog, last patrol, and configurable timings.',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          total: { type: 'number' }, active: { type: 'number' }, archived: { type: 'number' },
          pending: { type: 'number' }, pools: { type: 'string' }, lastPatrol: { type: 'string' },
          halfLife: { type: 'string' },
        },
        required: ['total', 'active', 'archived', 'pending', 'pools', 'lastPatrol', 'halfLife'],
      },
      render: (_a, v) => textBlock([
        `记忆库：${v.active} 活跃 / ${v.archived} 归档（共 ${v.total}）`,
        `海马体待归档：${v.pending} 条`,
        `分池：${v.pools}`,
        `最近夜巡：${v.lastPatrol}`,
        `半衰期：${v.halfLife}`,
      ].join('\n')),
    },
    execute: async () => {
      const cfg = loadConfig();
      const entries = allEntries();
      const hippo = readJsonl(HIPPO);
      const byPool = {};
      for (const e of entries) if (e.status !== 'archived') byPool[e.pool] = (byPool[e.pool] || 0) + 1;
      const reports = (() => { try { return readdirSync(PATROL_DIR).sort(); } catch { return []; } })();
      return {
        total: entries.length,
        active: entries.filter((e) => e.status !== 'archived').length,
        archived: entries.filter((e) => e.status === 'archived').length,
        pending: hippo.filter((r) => r.status !== 'archived').length,
        pools: Object.entries(byPool).map(([k, v]) => `${cfg.pools[k]?.label || k} ${v}`).join(' / ') || '（空）',
        lastPatrol: reports.length ? reports[reports.length - 1].replace(/\.md$/, '') : '从未',
        halfLife: Object.entries(cfg.pools).map(([k, v]) => `${v.label} ${v.halfLifeDays}天`).join(' / '),
      };
    },
  };
}

function toolRecall() {
  return {
    name: 'neuron_recall',
    description: 'Explicitly recall memories by a query. Returns the memory text with pool, age and effective weight; recalling extends their lifetime (spaced repetition).',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { query: { type: 'string', description: '关键词或一句话' }, limit: { type: 'number', description: '最多几条，默认 8' } },
      required: ['query'],
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { count: { type: 'number' }, items: { type: 'array', items: { type: 'string' } } },
        required: ['count', 'items'],
      },
      render: (_a, v) => textBlock(v.count === 0 ? '（没有命中记忆）' : v.items.join('\n')),
    },
    execute: async (args) => {
      const cfg = loadConfig();
      const limit = Math.min(20, Math.max(1, Number(args?.limit) || 8));
      const hits = recall(String(args?.query || ''), cfg).slice(0, limit);
      touch(hits.map((h) => h.entry.id), cfg);
      return {
        count: hits.length,
        items: hits.map((h) => {
          const def = cfg.pools[h.entry.pool] || cfg.pools.fact;
          return `[${def.label} · ${ageLabel(h.entry.lastTouched || h.entry.ts)} · ${h.state} · w${h.weight.toFixed(2)}] ${h.entry.text}`;
        }),
      };
    },
  };
}

function toolRemember() {
  return {
    name: 'neuron_remember',
    description: 'Write one memory. Default target is the hippocampus (raw buffer, gets archived later); pass pool to file it directly into a memory pool.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        text: { type: 'string', description: '要记住的内容' },
        pool: { type: 'string', description: '可选：core / fact / skill / daily / emotion；不传则进海马体' },
      },
      required: ['text'],
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, target: { type: 'string' }, id: { type: 'string' } }, required: ['ok', 'target', 'id'] },
      render: (_a, v) => textBlock(v.ok ? `已写入 ${v.target}（${v.id}）` : '写入失败'),
    },
    execute: async (args) => {
      const cfg = loadConfig();
      const text = String(args?.text || '').trim();
      if (text === '') throw new Error('text 不能为空');
      const rowId = id();
      const pool = args?.pool && cfg.pools[args.pool] ? args.pool : '';
      if (pool) {
        const entries = allEntries();
        entries.push({ id: rowId, ts: iso(), text, pool, rawWeight: 0.7, weight: 0.7, lastTouched: iso(), recalls: 0, status: 'active', source: 'tool' });
        saveEntries(entries);
        return { ok: true, target: `记忆库/${cfg.pools[pool].label}`, id: rowId };
      }
      const ok = appendJsonl(HIPPO, { id: rowId, ts: iso(), text, pool: poolOf(text, cfg), status: 'pending', source: 'tool' });
      return { ok, target: '海马体', id: rowId };
    },
  };
}

function toolArchive() {
  return {
    name: 'neuron_archive',
    description: 'Move hippocampus fragments into memory pools: pass ids, or all=true to archive every pending fragment (classified by keywords). Ids are shown by neuron_status? use neuron_recall? pending ids come from the patrol report.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: '要归档的海马体片段 id' },
        all: { type: 'boolean', description: 'true = 归档所有待处理片段' },
        pool: { type: 'string', description: '可选：强制指定池' },
      },
      required: [],
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { archived: { type: 'number' }, detail: { type: 'string' } }, required: ['archived', 'detail'] },
      render: (_a, v) => textBlock(`已归档 ${v.archived} 条${v.detail ? '\n' + v.detail : ''}`),
    },
    execute: async (args) => {
      const cfg = loadConfig();
      const hippo = readJsonl(HIPPO);
      const entries = allEntries();
      const wantIds = Array.isArray(args?.ids) ? args.ids.map(String) : [];
      const targets = hippo.filter((r) => r.status !== 'archived' && (args?.all === true || wantIds.includes(r.id)));
      const detail = [];
      for (const frag of targets.slice(0, 40)) {
        const pool = args?.pool && cfg.pools[args.pool] ? args.pool : (frag.pool || poolOf(frag.text, cfg));
        entries.push({ id: frag.id, ts: frag.ts, text: frag.text, pool, role: frag.role, session: frag.session, rawWeight: 0.55, weight: 0.55, lastTouched: frag.ts, recalls: 0, status: 'active', source: 'archive' });
        frag.status = 'archived';
        detail.push(`- [${cfg.pools[pool].label}] ${String(frag.text).slice(0, 100)}`);
      }
      if (targets.length > 0) { writeJsonl(HIPPO, hippo); saveEntries(entries); }
      return { archived: Math.min(targets.length, 40), detail: detail.join('\n') };
    },
  };
}

function toolTouch() {
  return {
    name: 'neuron_touch',
    description: 'Manually reinforce memories (spaced repetition): raise weight by 0.15 and reset their decay timer.',
    parameters: { type: 'object', additionalProperties: false, properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { touched: { type: 'number' } }, required: ['touched'] },
      render: (_a, v) => textBlock(`已强化 ${v.touched} 条记忆（权重 +0.15，衰减计时重置）`),
    },
    execute: async (args) => ({ touched: touch(Array.isArray(args?.ids) ? args.ids.map(String) : [], loadConfig()) }),
  };
}

function toolPatrol() {
  return {
    name: 'neuron_patrol',
    description: 'Run the nightly patrol now: archive pending hippocampus fragments, retire decayed memories, and write a patrol report. It never modifies the text of a memory.',
    parameters: { type: 'object', additionalProperties: false, properties: { force: { type: 'boolean' } }, required: [] },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, date: { type: 'string' }, archived: { type: 'number' }, retired: { type: 'number' }, report: { type: 'string' } }, required: ['ok', 'date', 'archived', 'retired', 'report'] },
      render: (_a, v) => textBlock(`夜巡完成 ${v.date}：归档 ${v.archived} 条，生命周期归档 ${v.retired} 条\n报告：${v.report}`),
    },
    execute: async () => {
      const cfg = loadConfig();
      const r = patrol(true, cfg, null);
      return { ok: true, date: r?.date || todayYmd(), archived: r?.archived ?? 0, retired: r?.retired ?? 0, report: r?.reportPath || '' };
    },
  };
}

function toolForget() {
  return {
    name: 'neuron_forget',
    description: 'Archive specific memories now (soft delete: text is kept in the file, lifecycle state becomes archived and it stops being injected/recalled).',
    parameters: { type: 'object', additionalProperties: false, properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { archived: { type: 'number' } }, required: ['archived'] },
      render: (_a, v) => textBlock(`已归档 ${v.archived} 条记忆（可审计，数据不删）`),
    },
    execute: async (args) => {
      const want = new Set(Array.isArray(args?.ids) ? args.ids.map(String) : []);
      const entries = allEntries();
      let n = 0;
      for (const e of entries) if (want.has(e.id) && e.status !== 'archived') { e.status = 'archived'; n += 1; }
      if (n > 0) saveEntries(entries);
      return { archived: n };
    },
  };
}

/* ─────────── 全机数据（会话 / 花费 / 插件 / 服务 / 系统） ─────────── */

function collectSystem() {
  const cpu = cpus();
  const load = loadavg();
  return {
    hostname: hostname(), platform: platform(), release: release(),
    node: process.version, pid: process.pid,
    cpuCount: cpu.length, cpuModel: cpu[0]?.model ?? '',
    load1: Math.round((load[0] || 0) * 100) / 100,
    memTotal: totalmem(), memFree: freemem(),
    osUptime: Math.round(uptime()), cwd: process.cwd(),
    profile: process.env.DSH_PROFILE || 'desktop',
  };
}

function collectSessions(limit = 14) {
  try {
    if (!existsSync(PROJ_CACHE)) return [];
    const rows = [];
    for (const name of readdirSync(PROJ_CACHE)) {
      if (!name.endsWith('.json')) continue;
      const r = readJson(join(PROJ_CACHE, name), null)?.record?.rows;
      if (!r) continue;
      const title = String(r.title?.val ?? '').replace(/\s+/g, ' ').trim();
      rows.push({
        id: name.replace(/\.json$/, ''),
        title: title === '' ? '(无标题会话)' : title.slice(0, 80),
        at: Number(r.sessionListMetadata?.val?.lastPromptAt) || 0,
        model: r.modelSelection?.val?.lastUsed?.model ?? '',
        cwd: r.workingDirectory?.val ?? '',
        tokens: r.tokenUsage?.val?.totals ?? null,
      });
    }
    rows.sort((a, b) => b.at - a.at);
    return rows.slice(0, limit);
  } catch { return []; }
}

function collectCost() {
  const usage = readJson(USAGE_FILE, null);
  const events = Array.isArray(usage?.events) ? usage.events : [];
  const today = usage?.date ?? '';
  const todayEvents = events.filter((e) => e.day === today);
  return {
    balance: usage?.lastBalance ?? null,
    todayUsage: usage?.todayUsage ?? null,
    todayTokens: todayEvents.reduce((s, e) => s + (Number(e.tokens) || 0), 0),
    calls: todayEvents.length,
  };
}

function collectPlugins() {
  const pkg = readJson(join(PROFILE_DIR, 'package.json'), null);
  let dirs = [];
  try { dirs = readdirSync(PLUGINS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* ignore */ }
  const bundles = pkg?.dsh?.profile?.bundles ?? [];
  return { dependencies: Object.keys(pkg?.dependencies ?? {}), bundles, extraBundles: bundles.filter((b) => !b.startsWith('@deepseek-ai/')), dirs };
}

async function collectServices() {
  const probe = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
  const [core, shim, dashboard] = await Promise.all([
    probe('http://127.0.0.1:8420/health'),
    probe('http://127.0.0.1:8430/v1/models'),
    probe('http://127.0.0.1:8421/api/summary'),
  ]);
  return { core, shim, dashboard };
}

function collectChainMeta() {
  const rows = readJsonl(LEGACY_CHAIN).filter((r) => typeof r.judgement === 'string' && r.judgement !== '');
  rows.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return { count: rows.length, recent: rows.slice(0, 8).map((r) => ({ ts: r.ts, judgement: String(r.judgement).slice(0, 120), conclusion: String(r.conclusion ?? '').slice(0, 120) })) };
}

/** 合并记忆 + 全机数据，供 3D 星云一次取回。 */
async function collectPanel() {
  const nowCfg = loadConfig();
  const now = Date.now();
  const entries = allEntries();
  const hippo = readJsonl(HIPPO);
  const pools = Object.entries(nowCfg.pools).map(([key, def]) => ({ key, label: def.label, color: def.color, halfLifeDays: def.halfLifeDays, graceDays: def.graceDays, archiveDays: def.archiveDays }));
  const items = entries.map((e) => ({
    id: e.id, text: String(e.text).slice(0, 240), pool: e.pool, ts: e.ts, lastTouched: e.lastTouched ?? e.ts,
    weight: Math.round(effectiveWeight(e, nowCfg, now) * 1000) / 1000,
    rawWeight: e.rawWeight ?? e.weight ?? 0.5,
    state: lifecycle(e, nowCfg, now),
    recalls: e.recalls || 0,
    ageDays: Math.round(days(e.lastTouched || e.ts, now) * 10) / 10,
  }));
  const reports = (() => { try { return readdirSync(PATROL_DIR).filter((f) => f.endsWith('.md')).sort(); } catch { return []; } })();
  const [services] = await Promise.all([collectServices()]);
  return {
    at: iso(),
    pools,
    items,
    stats: {
      total: items.length,
      active: items.filter((i) => i.state !== 'archived').length,
      archived: items.filter((i) => i.state === 'archived').length,
      pending: hippo.filter((r) => r.status !== 'archived').length,
      byState: items.reduce((acc, i) => { acc[i.state] = (acc[i.state] || 0) + 1; return acc; }, {}),
    },
    config: { injection: nowCfg.injection, patrol: nowCfg.patrol, capture: nowCfg.capture },
    lastPatrol: reports.length ? reports[reports.length - 1].replace(/\.md$/, '') : null,
    system: collectSystem(),
    sessions: collectSessions(),
    cost: collectCost(),
    plugins: collectPlugins(),
    services,
    chain: collectChainMeta(),
  };
}

/* ─────────────────────────────── 装配 ─────────────────────────────── */

export function apply(ctx) {
  const disposers = [];
  ensureHome();
  const cfg = loadConfig();
  if (!existsSync(CONFIG)) saveConfig(cfg);
  // 预置最近片段的去重哈希，避免重启后重复写海马体
  try {
    for (const r of readJsonl(HIPPO).slice(-200)) recentHashes.set(hash(String(r.role || '') + '|' + String(r.text || '')), Date.now());
  } catch { /* ignore */ }
  const imported = importLegacyChain(cfg);

  const guard = (label, fn) => {
    try { disposers.push(fn()); } catch (error) {
      try { ctx.logger?.warn?.(`[neuron-memory] ${label} register failed: ${error?.message ?? String(error)}`); } catch { /* ignore */ }
    }
  };

  for (const tool of [toolStatus(), toolRecall(), toolRemember(), toolArchive(), toolTouch(), toolPatrol(), toolForget()]) {
    guard('tool', () => ctx.tools.register(tool));
  }

  guard('section', () => ctx.systemPrompt.section({
    name: 'neuron-memory:inject',
    order: 840,
    text: ({ scope }) => {
      try {
        const nowCfg = loadConfig();
        const inj = buildInjection(scope, nowCfg);
        capture(scope, nowCfg);
        return inj === '' ? '' : '## 神经元记忆（只对我可见）\n' + inj;
      } catch (error) {
        try { ctx.logger?.warn?.(`[neuron-memory] section failed: ${error?.message ?? String(error)}`); } catch { /* ignore */ }
        return '';
      }
    },
  }));

  // 夜巡定时：每 10 分钟检查一次「今天到点了吗」
  if (typeof ctx.inject === 'function') {
    ctx.inject(['timer'], (timerCtx) => {
      try {
        const check = () => {
          try { patrol(false, loadConfig(), ctx); } catch { /* ignore */ }
        };
        const kick = timerCtx.setTimeout?.(check, 90 * 1000);
        if (typeof kick === 'function') disposers.push(kick);
        const dispose = timerCtx.setInterval?.(check, 10 * 60 * 1000);
        if (typeof dispose === 'function') disposers.push(dispose);
      } catch { /* timer 不可用不影响工具与注入 */ }
    });
  }

  // 面板数据接口
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (webCtx) => {
      try {
        const handler = async (req, res) => {
          if (!String(req.url || '').startsWith('/neuron-memory/api/data')) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          try {
            const nowCfg = loadConfig();
            const now = Date.now();
            const entries = allEntries();
            const hippo = readJsonl(HIPPO);
            const pools = Object.entries(nowCfg.pools).map(([key, def]) => ({ key, label: def.label, color: def.color, halfLifeDays: def.halfLifeDays, graceDays: def.graceDays, archiveDays: def.archiveDays }));
            const items = entries.map((e) => ({
              id: e.id, text: String(e.text).slice(0, 240), pool: e.pool, ts: e.ts, lastTouched: e.lastTouched ?? e.ts,
              weight: Math.round(effectiveWeight(e, nowCfg, now) * 1000) / 1000,
              rawWeight: e.rawWeight ?? e.weight ?? 0.5,
              state: lifecycle(e, nowCfg, now),
              recalls: e.recalls || 0,
              ageDays: Math.round(days(e.lastTouched || e.ts, now) * 10) / 10,
            }));
            const reports = (() => { try { return readdirSync(PATROL_DIR).filter((f) => f.endsWith('.md')).sort(); } catch { return []; } })();
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            res.end(JSON.stringify({
              at: iso(), pools, items,
              stats: {
                total: items.length,
                active: items.filter((i) => i.state !== 'archived').length,
                archived: items.filter((i) => i.state === 'archived').length,
                pending: hippo.filter((r) => r.status !== 'archived').length,
                byState: items.reduce((acc, i) => { acc[i.state] = (acc[i.state] || 0) + 1; return acc; }, {}),
              },
              config: { injection: nowCfg.injection, patrol: nowCfg.patrol, capture: nowCfg.capture },
              lastPatrol: reports.length ? reports[reports.length - 1].replace(/\.md$/, '') : null,
            }));
          } catch (error) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: String(error?.message ?? error) }));
          }
        };
        disposers.push(webCtx.webServer.register({ kind: 'prefix', path: '/neuron-memory', handler }));

        // 合并后的唯一接口：记忆 + 会话 + 花费 + 插件 + 服务 + 系统（3D 星云用）
        const merged = async (req, res) => {
          if (!String(req.url || '').startsWith('/neuron/api/data')) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'not found' }));
            return;
          }
          try {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            res.end(JSON.stringify(await collectPanel()));
          } catch (error) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: String(error?.message ?? error) }));
          }
        };
        disposers.push(webCtx.webServer.register({ kind: 'prefix', path: '/neuron', handler: merged }));
      } catch (error) {
        try { ctx.logger?.warn?.(`[neuron-memory] web mount failed: ${error?.message ?? String(error)}`); } catch { /* ignore */ }
      }
    });
  }

  if (typeof ctx.on === 'function') {
    try {
      ctx.on('dispose', () => {
        for (const d of disposers.reverse()) { try { if (typeof d === 'function') d(); } catch { /* ignore */ } }
      });
    } catch { /* ignore */ }
  }

  try {
    ctx.logger?.info?.(`[neuron-memory] ready; home=${HOME}; pools=${Object.keys(cfg.pools).join(',')}; patrol=${cfg.patrol.hour}:${String(cfg.patrol.minute).padStart(2, '0')}`);
  } catch { /* ignore */ }
}

export { loadConfig, saveConfig, recall, patrol, effectiveWeight, lifecycle, poolOf, tokens, DEFAULT_CONFIG, collectPanel };
