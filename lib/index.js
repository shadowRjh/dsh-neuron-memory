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

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, hostname, platform, release, cpus, totalmem, freemem, loadavg, uptime } from 'node:os';
import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';

export const name = 'neuron-memory';
export const inject = ['tools', 'systemPrompt'];

const HOME = process.env.NEURON_HOME || join(homedir(), '.dsh', 'memories', '.neuron');
const HIPPO = join(HOME, 'hippocampus.jsonl');
const ENTRIES = join(HOME, 'entries.jsonl');
const CONFIG = join(HOME, 'config.json');
const PATROL_DIR = join(HOME, 'patrol');
/** 交接层：覆盖写、≤4KB，每轮固定注入（学自手写交接式记忆插件）。 */
const HANDOFF = join(HOME, 'handoff.md');
const HANDOFF_HISTORY = join(HOME, 'handoff-history.jsonl');
/** 会话原文归档（翻旧账）：多帧 zstd，按帧解压后搜原话。 */
const SESSIONS_DIR = join(homedir(), '.dsh', 'sessions');
/** 旧 dsh-chain 的数据文件；首次启动时一次性导入，避免换插件就「失忆」。 */
const LEGACY_CHAIN = join(homedir(), '.dsh', 'memories', '.chain-shared', 'chains.jsonl');

/* 全机数据源（会话 / 花费 / 插件 / 系统），与记忆节点一起画进 3D 星云 */
const DSH_HOME = join(homedir(), '.dsh');
const PROJ_CACHE = join(DSH_HOME, 'storages', 'session_projcache', 'sessions');
const USAGE_FILE = join(DSH_HOME, '.dshw-usage.json');
const PROFILE_DIR = join(DSH_HOME, 'profiles', 'desktop');
const PLUGINS_DIR = join(DSH_HOME, 'plugins');
/** 生态桥 1：鱼的心情（dsh-feiyu-mood）的状态文件（须在 DSH_HOME 之后声明）。 */
const FEIYU_STATE = process.env.NEURON_FEIYU_STATE || join(DSH_HOME, 'feiyu-mood', 'state.json');
/** 生态桥 2：鱼的记忆（dsh-fish-memory）的库目录。 */
const FISH_DIR = process.env.NEURON_FISH_DIR || join(DSH_HOME, 'fish-memory');
const FISH_IMPORT_MARK = join(HOME, 'fish-import.json');

/* ─────────────────────────── 默认参数（全部可改） ─────────────────────────── */

const DEFAULT_CONFIG = {
  version: 2,
  capture: { enabled: true, includeAssistant: true, maxHippocampus: 400, maxChars: 1200 },
  injection: { budgetChars: 900, maxItems: 6, minWeight: 0.08, recentLimit: 2 },
  patrol: { hour: 3, minute: 10, autoArchive: true, maxArchivePerRun: 24 },
  /** 硬上限：单条记忆长度、每池条数、交接层长度。超出即裁剪/归档，防止无限膨胀。 */
  limits: { maxEntryChars: 2000, maxPerPool: 200, handoffMaxChars: 4000 },
  /** 交接层：全量存盘，默认只注入 minimal 视图（项目/下一步/卡点），省上下文。 */
  handoff: { enabled: true, injectChars: 600, autoCompact: true, compactEveryTurns: 12, compactThreshold: 800 },
  /** 情绪：事件落库阈值、同向召回加权、情绪锚点额外强化。 */
  emotion: { eventMinDelta: 5, recallBoost: 0.15, anchorBonus: 0.1 },
  /** 向量检索（可选，默认关）：接本地 embedding 服务；任何失败都自动退回关键词。 */
  retrieval: {
    vector: {
      enabled: false,
      url: 'http://127.0.0.1:11434/api/embed',
      model: 'bge-m3',
      timeoutMs: 4000,
      maxCandidates: 200,
      blend: 0.5,
    },
  },
  /** 生态桥：读取同机其它记忆/心情插件的状态（没装时自动跳过）。 */
  bridges: {
    feiyuMood: { enabled: true },
    fishMemory: { enabled: true, autoImport: true },
  },
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
      if (k === 'bridges') {
        for (const [b, def] of Object.entries(merged.bridges)) {
          if (v[b] && typeof v[b] === 'object') merged.bridges[b] = { ...def, ...v[b] };
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
        .filter((l) => !/^(Time sampled|Current runtime context|Current working directory|Current DSH file policy|Approval policy|Browser file zone|Browser time zone|Elapsed since|Tokens prefixed|Non-zero exits|Use the read tool|Use the glob tool|Use the grep tool|Use the skill tool|Use the workflow tool|You are an AI agent|Agent Teams is available|Use list_agents|create_goal may|After session resume|Current DeepSeek Harness)/.test(l.trim()))
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

/* ───────────── 向量检索（v2.4，可选；失败自动退回关键词） ───────────── */

const VECTORS = join(HOME, 'vectors.jsonl');
const queryVecCache = new Map();
const vectorState = { ok: null, at: null };

function vectorCfg(cfg) {
  return (cfg && cfg.retrieval && cfg.retrieval.vector) || {};
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

async function embedText(text, cfg) {
  const v = vectorCfg(cfg);
  if (!v.enabled) return null;
  try {
    const res = await fetch(v.url || 'http://127.0.0.1:11434/api/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(v.token ? { authorization: 'Bearer ' + v.token } : {}) },
      body: JSON.stringify({ model: v.model || 'bge-m3', input: String(text).slice(0, 2000) }),
      signal: AbortSignal.timeout(Math.max(500, Number(v.timeoutMs) || 4000)),
    });
    if (!res.ok) throw new Error('embed http ' + res.status);
    const json = await res.json();
    const vec = Array.isArray(json.embeddings?.[0])
      ? json.embeddings[0]
      : (Array.isArray(json.data?.[0]?.embedding) ? json.data[0].embedding : null);
    if (!vec) throw new Error('embed response missing vector');
    vectorState.ok = true;
    vectorState.at = iso();
    return vec;
  } catch {
    vectorState.ok = false;
    vectorState.at = iso();
    return null;
  }
}

function loadVectors() {
  const map = new Map();
  for (const row of readJsonl(VECTORS)) {
    if (row && row.id && Array.isArray(row.vector)) map.set(row.id, row.vector);
  }
  return map;
}

/** 给最近活跃的条目补向量（每次最多 limit 条，后台调用，失败静默）。 */
async function ensureVectors(cfg, limit = 40) {
  const v = vectorCfg(cfg);
  if (!v.enabled) return 0;
  const rows = loadVectors();
  const cap = Math.max(10, Number(v.maxCandidates) || 200);
  const entries = allEntries()
    .filter((e) => e.status !== 'archived')
    .sort((a, b) => String(b.lastTouched || b.ts).localeCompare(String(a.lastTouched || a.ts)));
  let added = 0;
  for (const entry of entries.slice(0, cap)) {
    if (rows.has(entry.id)) continue;
    if (added >= limit) break;
    const vec = await embedText(entry.text, cfg);
    if (!vec) break;
    rows.set(entry.id, vec);
    added += 1;
  }
  if (added > 0) {
    writeJsonl(VECTORS, [...rows.entries()].map(([id, vector]) => ({ id, vector })));
  }
  return added;
}

async function ensureQueryVector(text, cfg) {
  const q = String(text || '').trim();
  if (q === '' || !vectorCfg(cfg).enabled) return null;
  const key = hash(q);
  if (queryVecCache.has(key)) return queryVecCache.get(key);
  const vec = await embedText(q, cfg);
  if (vec) {
    if (queryVecCache.size > 40) queryVecCache.clear();
    queryVecCache.set(key, vec);
  }
  return vec;
}

function queryVectorFor(text) {
  const q = String(text || '').trim();
  if (q === '') return null;
  return queryVecCache.get(hash(q)) || null;
}

function recall(query, cfg, opts = {}) {
  const now = Date.now();
  const qTokens = tokens(query);
  const vecCfg = vectorCfg(cfg);
  const queryVec = vecCfg.enabled ? (opts.queryVector || null) : null;
  const entryVecs = queryVec ? loadVectors() : null;
  const mood = cfg.bridges?.feiyuMood?.enabled !== false ? readMoodBridge() : null;
  const moodSign = mood ? (mood.value >= 62 ? 1 : mood.value < 42 ? -1 : 0) : 0;
  const boost = Number(cfg.emotion?.recallBoost) || 0.15;
  const blend = Math.max(0, Math.min(1, Number(vecCfg.blend) || 0.5));
  const scored = [];
  for (const entry of allEntries()) {
    const state = lifecycle(entry, cfg, now);
    if (state === 'archived') continue;
    const weight = effectiveWeight(entry, cfg, now);
    if (weight < cfg.injection.minWeight) continue;
    let score = overlapScore(qTokens, entry.text);
    if (queryVec && entryVecs && entryVecs.has(entry.id)) {
      const sim = cosine(queryVec, entryVecs.get(entry.id));
      score = score * (1 - blend) + Math.max(0, sim) * blend;
    }
    if (qTokens.length > 0 && score <= 0) continue;
    let rank = score * 0.75 + weight * 0.35;
    // 情绪加权召回：心情与记忆情感同向时更容易被想起，反向时轻微抑制
    if (moodSign !== 0) {
      const es = Number(entry.sentiment) || sentimentOf(entry.text);
      if (es === moodSign) rank += boost;
      else if (es === -moodSign) rank -= boost * 0.5;
    }
    scored.push({ entry, score, weight, state, rank });
  }
  scored.sort((a, b) => b.rank - a.rank);
  return scored.slice(0, cfg.injection.maxItems);
}

function touch(ids, cfg) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const rows = allEntries();
  let n = 0;
  const now = iso();
  const anchor = Number(cfg.emotion?.anchorBonus) || 0.1;
  for (const row of rows) {
    if (!ids.includes(row.id)) continue;
    const step = row.pool === 'emotion' ? 0.15 + anchor : 0.15;
    row.rawWeight = Math.min(1, Number(row.rawWeight ?? row.weight ?? 0.5) + step);
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

/* ───────────── 交接最小视图 / 自动压缩（v2.3） ───────────── */

const HANDOFF_FIELD_RE = /^-\s*(项目|已完成|下一步|卡在|备注)[：:]\s*(.*)$/;
let sectionTurns = 0;

function parseHandoff(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(HANDOFF_FIELD_RE);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function handoffMinimal(cfg) {
  const cap = Math.max(120, Number(cfg.handoff?.injectChars) || 600);
  const fields = parseHandoff(readHandoff());
  const parts = [];
  const push = (k, max) => {
    const v = String(fields[k] || '').trim();
    if (v) parts.push(`- ${k}：${v.slice(0, max)}`);
  };
  push('项目', 100);
  push('下一步', Math.floor(cap * 0.45));
  push('卡在', Math.floor(cap * 0.3));
  if (parts.length === 0) return readHandoff().trim().slice(0, cap);
  const out = parts.join('\n');
  return out.length > cap ? out.slice(0, cap - 1) + '…' : out;
}

function compactHandoff(cfg, force = false) {
  const full = readHandoff();
  if (full.trim() === '') return { changed: false, chars: 0 };
  const fields = parseHandoff(full);
  const caps = { 项目: 120, 已完成: 320, 下一步: 220, 卡在: 160, 备注: 200 };
  const lines = ['# 交接（自动压缩）', ''];
  for (const k of ['项目', '已完成', '下一步', '卡在', '备注']) {
    const v = String(fields[k] || '').trim();
    if (v) lines.push(`- ${k}：${v.slice(0, caps[k] || 200)}${v.length > (caps[k] || 200) ? '…' : ''}`);
  }
  const next = lines.join('\n') + '\n';
  const threshold = Number(cfg.handoff?.compactThreshold) || 800;
  const should = force || full.length > threshold;
  if (!should || next.length >= full.length * 0.9) return { changed: false, chars: full.length };
  appendJsonl(HANDOFF_HISTORY, { ts: iso(), text: full, reason: 'auto-compact' });
  ensureHome();
  writeFileSync(HANDOFF, next, 'utf8');
  return { changed: true, chars: next.length, before: full.length };
}

function maybeAutoCompact(cfg) {
  if (cfg.handoff?.autoCompact === false) return;
  sectionTurns += 1;
  const every = Math.max(1, Number(cfg.handoff?.compactEveryTurns) || 12);
  if (sectionTurns % every !== 0) return;
  try { compactHandoff(cfg, false); } catch { /* ignore */ }
}

/* ───────────── 情绪（v2.3）：情感判定 / 事件落库 ───────────── */

const POS_WORDS = ['开心', '喜欢', '夸', '好', '棒', '顺利', '感谢', '笑', '甜蜜', '踏实', '幸福', '满意'];
const NEG_WORDS = ['难过', '担心', '烦', '累', '气', '崩', '失败', '焦虑', '心疼', '讨厌', '失望', '压力'];

function sentimentOf(text) {
  const s = String(text || '');
  let pos = 0;
  let neg = 0;
  for (const w of POS_WORDS) if (s.includes(w)) pos += 1;
  for (const w of NEG_WORDS) if (s.includes(w)) neg += 1;
  return pos === neg ? 0 : (pos > neg ? 1 : -1);
}

function registerMoodEvent(mood, cfg) {
  if (!mood) return;
  const path = join(HOME, 'mood-bridge.json');
  const last = readJson(path, null);
  const delta = last ? mood.value - Number(last.value) : 0;
  try { writeFileSync(path, JSON.stringify({ value: mood.value, label: mood.label, at: iso() }), 'utf8'); } catch { /* ignore */ }
  if (!last || Math.abs(delta) < (Number(cfg.emotion?.eventMinDelta) || 5)) return;
  const rows = allEntries();
  const text = `心情 ${last.value} → ${mood.value}（${mood.label}）${mood.reason ? '：' + mood.reason : ''}`;
  if (rows.some((r) => r.source === 'mood-bridge' && r.text === text)) return;
  rows.push({
    id: 'mood_' + hash(text),
    ts: iso(),
    text: clampText(text, cfg),
    pool: 'emotion',
    role: 'assistant',
    session: '',
    rawWeight: 0.6,
    weight: 0.6,
    lastTouched: iso(),
    recalls: 0,
    status: 'active',
    source: 'mood-bridge',
    sentiment: delta >= 0 ? 1 : -1,
    tags: ['心情', mood.label],
  });
  saveEntries(rows);
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

  // 2.5) 硬上限：裁剪超长条目 + 每池条数上限（超出按权重/年龄归档）
  try { enforceLimits(cfg); } catch { /* ignore */ }

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

/* ───────────────────── 交接层（覆盖写，≤4KB） ───────────────────── */

function clampText(text, cfg) {
  const max = cfg.limits?.maxEntryChars || 2000;
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function readHandoff() {
  try { return existsSync(HANDOFF) ? readFileSync(HANDOFF, 'utf8') : ''; } catch { return ''; }
}

function handoffInfo(cfg = loadConfig()) {
  const text = readHandoff();
  let mtime = null;
  try { mtime = existsSync(HANDOFF) ? statSync(HANDOFF).mtime.toISOString() : null; } catch { /* ignore */ }
  return { text, chars: text.length, limit: cfg.limits?.handoffMaxChars || 4000, updatedAt: mtime };
}

function writeHandoff(input, cfg = loadConfig()) {
  const parts = [];
  const line = (k, v) => { const s = String(v ?? '').trim(); if (s !== '') parts.push(`- ${k}：${s}`); };
  line('项目', input?.project);
  line('已完成', input?.did);
  line('下一步', input?.next);
  line('卡在', input?.blocked);
  line('备注', input?.note);
  if (parts.length === 0) return { ok: false, error: '至少给一个字段（project/did/next/blocked/note）' };
  const limit = cfg.limits?.handoffMaxChars || 4000;
  let body = `# 交接 · ${new Date().toLocaleString('zh-CN')}\n\n` + parts.join('\n') + '\n';
  let truncated = false;
  if (body.length > limit) { body = body.slice(0, limit - 1) + '…\n'; truncated = true; }
  const prev = readHandoff();
  if (prev.trim() !== '') appendJsonl(HANDOFF_HISTORY, { ts: iso(), text: prev });
  ensureHome();
  writeFileSync(HANDOFF, body, 'utf8');
  return { ok: true, chars: body.length, limit, truncated, text: body, updatedAt: iso() };
}

/* ───────────── 硬上限：单条裁剪 + 每池条数上限（超出按权重/年龄归档） ───────────── */

function enforceLimits(cfg = loadConfig()) {
  const rows = allEntries();
  const maxChars = cfg.limits?.maxEntryChars || 2000;
  const maxPerPool = cfg.limits?.maxPerPool || 200;
  let changed = 0;
  for (const row of rows) {
    if (typeof row.text === 'string' && row.text.length > maxChars) { row.text = row.text.slice(0, maxChars) + '…'; changed += 1; }
  }
  const byPool = {};
  for (const row of rows) { if (row.status !== 'archived') (byPool[row.pool] = byPool[row.pool] || []).push(row); }
  const nowMs = Date.now();
  for (const list of Object.values(byPool)) {
    if (list.length <= maxPerPool) continue;
    list.sort((a, b) => effectiveWeight(a, cfg, nowMs) - effectiveWeight(b, cfg, nowMs) || days(b.lastTouched || b.ts, nowMs) - days(a.lastTouched || a.ts, nowMs));
    for (const row of list.slice(0, list.length - maxPerPool)) { row.status = 'archived'; changed += 1; }
  }
  if (changed > 0) saveEntries(rows);
  return changed;
}

/* ───────────────── 会话原文检索（翻旧账，多帧 zstd） ───────────────── */

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function decodeZstdFrames(buf) {
  if (typeof zlib.zstdDecompressSync !== 'function') throw new Error('当前 Node 不支持 zstd（需要 >=22.15）');
  const starts = [];
  let i = 0;
  while ((i = buf.indexOf(ZSTD_MAGIC, i)) !== -1) { starts.push(i); i += 4; }
  if (starts.length === 0) throw new Error('不是 zstd 文件');
  const chunks = [];
  for (let j = 0; j < starts.length; j += 1) {
    const end = j + 1 < starts.length ? starts[j + 1] : buf.length;
    chunks.push(zlib.zstdDecompressSync(buf.subarray(starts[j], end)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function extractText(obj) {
  if (!obj || typeof obj !== 'object') return '';
  function pick(v) {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      return v.map((x) => {
        if (typeof x === 'string') return x;
        if (x && typeof x === 'object') {
          if (typeof x.text === 'string') return x.text;
          const nested = pick(x.content);
          if (nested) return nested;
          if (typeof x.message === 'string') return x.message;
          return '';
        }
        return String(x ?? '');
      }).filter(Boolean).join('\n').trim();
    }
    return '';
  }
  for (const key of ['text', 'content', 'message', 'title', 'summary', 'prompt']) {
    const v = pick(obj[key]);
    if (v !== '') return v.slice(0, 600);
  }
  if (obj.message && typeof obj.message === 'object') {
    const v = pick(obj.message.content) || pick(obj.message.text);
    if (v !== '') return v.slice(0, 600);
  }
  // 会话事件行：{"type":"agent/inbox/spliced","data":{"inserted":[{"content":[{"type":"text","text":"..."}]}]}}
  if (obj.data && typeof obj.data === 'object') {
    const v = pick(obj.data.inserted) || pick(obj.data.content) || pick(obj.data.text) || pick(obj.data.title) || pick(obj.data.message);
    if (v !== '') return v.slice(0, 600);
  }
  return '';
}

function listSessionFiles(limit = 80) {
  const out = [];
  try {
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.jsonl.zstd')) {
          let mtime = 0;
          try { mtime = statSync(p).mtimeMs; } catch { /* ignore */ }
          out.push({ path: p, mtime });
        }
      }
    };
    walk(SESSIONS_DIR);
  } catch { /* ignore */ }
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

/** 在历史会话原文里按关键词找句子。 */
function searchSessions(query, limit = 8) {
  const q = String(query || '').trim();
  if (q === '') return { query: q, count: 0, scanned: 0, items: [] };
  const needle = q.toLowerCase();
  const items = [];
  const files = listSessionFiles(80);
  const max = Math.min(20, Math.max(1, Number(limit) || 8));
  for (const f of files) {
    if (items.length >= max) break;
    let text = '';
    try { text = decodeZstdFrames(readFileSync(f.path)); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '' || !line.toLowerCase().includes(needle)) continue;
      let body = '';
      try { body = extractText(JSON.parse(line)); } catch { /* not json */ }
      if (body === '') body = line.slice(0, 300);
      items.push({ file: f.path.split('\\').slice(-2).join('/'), text: body, at: new Date(f.mtime).toISOString() });
      if (items.length >= max) break;
    }
  }
  return { query: q, count: items.length, scanned: files.length, items };
}

/* ─────────────────── 生态桥 1：鱼的心情（dsh-feiyu-mood） ─────────────────── */

const DIM_LABELS = { happy: '开心', calm: '踏实', sweet: '甜蜜', heartache: '心疼', worry: '担心', sad: '难过', jealous: '吃醋' };

function moodLabel(v) {
  if (v >= 80) return { label: '欢喜', color: '#ffd24a' };
  if (v >= 62) return { label: '开心', color: '#7fd4ff' };
  if (v >= 42) return { label: '一般', color: '#8ea4c6' };
  if (v >= 25) return { label: '心疼', color: '#ffb46a' };
  return { label: '难过', color: '#ff7fb4' };
}

function readMoodBridge() {
  const raw = readJson(FEIYU_STATE, null);
  if (!raw || typeof raw !== 'object') return null;
  const moods = raw.moods && typeof raw.moods === 'object' ? raw.moods : {};
  const ids = Object.keys(moods);
  const state = ids.length ? (moods[raw.lastActive] || moods[ids[0]]) : null;
  if (!state || typeof state !== 'object') return null;
  const value = Math.max(0, Math.min(100, Math.round(Number(state.mood) || 0)));
  const dims = state.dims && typeof state.dims === 'object' ? state.dims : {};
  const top = Object.entries(dims)
    .filter(([, n]) => Number(n) >= 1)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([k, n]) => `${DIM_LABELS[k] || k} +${Math.round(Number(n))}`);
  return {
    value,
    label: moodLabel(value).label,
    color: moodLabel(value).color,
    dims: top,
    reason: String(state.lastReason || '').slice(0, 120),
    confidence: Math.round(Number(state.lastConfidence) || 0),
    updatedAt: Number(state.updatedAt) || null,
    timeline: Array.isArray(state.timeline)
      ? state.timeline.slice(-10).map((t) => ({ at: Number(t.at) || null, mood: Math.round(Number(t.mood) || 0), reason: String(t.reason || '').slice(0, 60) }))
      : [],
  };
}

/* ─────────────────── 生态桥 2：鱼的记忆（dsh-fish-memory） ─────────────────── */

function importFishMemory(cfg) {
  let files = [];
  try { files = readdirSync(FISH_DIR).filter((f) => f.endsWith('.json')); } catch { return { imported: 0, skipped: 0, sessions: 0, error: 'fish-memory 目录不存在' }; }
  const rows = allEntries();
  const seen = new Set(rows.map((r) => String(r.text)));
  let imported = 0;
  let skipped = 0;
  let sessions = 0;
  for (const f of files) {
    const store = readJson(join(FISH_DIR, f), null);
    if (!store || !Array.isArray(store.memories)) continue;
    sessions += 1;
    for (const m of store.memories) {
      const text = String(m?.text || '').trim();
      if (text === '' || seen.has(text)) { skipped += 1; continue; }
      seen.add(text);
      const imp = Math.max(1, Math.min(3, Number(m.importance) || 1));
      const stable = m.category === 'stable_profile';
      const ts = m.at || m.createdAt || iso();
      rows.push({
        id: 'fish_' + hash(text),
        ts,
        text: clampText(text, cfg),
        pool: stable ? 'core' : poolOf(text, cfg),
        role: 'user',
        session: f.replace(/\.json$/, ''),
        rawWeight: Math.max(0.3, Math.min(0.95, 0.35 + imp * 0.15 + (stable ? 0.1 : 0))),
        weight: 0,
        lastTouched: ts,
        recalls: 0,
        status: 'active',
        source: 'fish-memory',
        tags: Array.isArray(m.tags) ? m.tags.slice(0, 6) : [],
      });
      imported += 1;
    }
  }
  for (const r of rows) if (r.weight === 0) r.weight = r.rawWeight;
  if (imported > 0) saveEntries(rows);
  try { writeFileSync(FISH_IMPORT_MARK, JSON.stringify({ at: iso(), imported, skipped, sessions }), 'utf8'); } catch { /* ignore */ }
  return { imported, skipped, sessions };
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
  const hits = recall(said, cfg, { queryVector: queryVectorFor(said) });
  try {
    queueMicrotask(() => {
      ensureQueryVector(said, cfg).then(() => ensureVectors(cfg)).catch(() => {});
    });
  } catch { /* ignore */ }
  const parts = [];
  if (cfg.handoff?.enabled !== false) {
    const h = handoffMinimal(cfg);
    if (h !== '') parts.push(`### 当前交接（最小视图）\n` + h);
  }
  if (cfg.bridges?.feiyuMood?.enabled !== false) {
    const mood = readMoodBridge();
    if (mood) {
      const dims = mood.dims.length ? '｜' + mood.dims.join(' · ') : '';
      const why = mood.reason ? '｜理由：' + mood.reason : '';
      parts.push(`### 当前心情（来自 dsh-feiyu-mood）\n- ${mood.value}/100（${mood.label}）${dims}${why}`);
      try { registerMoodEvent(mood, cfg); } catch { /* ignore */ }
    }
  }
  try { maybeAutoCompact(cfg); } catch { /* ignore */ }
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

function toolHandoff() {
  return {
    name: 'neuron_handoff',
    description: 'Write or read the handoff layer: §0 current state (project / did / next / blocked / note). Hard-capped at 4KB, overwritten each time, and injected every turn so a new session immediately knows where the work stands. Call with no fields to read it back.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        project: { type: 'string', description: '项目/主题' },
        did: { type: 'string', description: '已完成什么' },
        next: { type: 'string', description: '下一步' },
        blocked: { type: 'string', description: '卡在哪里' },
        note: { type: 'string', description: '备注' },
      },
      required: [],
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, chars: { type: 'number' }, limit: { type: 'number' }, text: { type: 'string' } }, required: ['ok', 'chars', 'limit', 'text'] },
      render: (_a, v) => textBlock(v.ok ? `交接已更新（${v.chars}/${v.limit} 字）\n\n${v.text}` : `当前交接（${v.chars}/${v.limit} 字）\n\n${v.text || '（还没有交接内容）'}`),
    },
    execute: async (args) => {
      const cfg = loadConfig();
      const hasInput = ['project', 'did', 'next', 'blocked', 'note'].some((k) => String(args?.[k] ?? '').trim() !== '');
      if (hasInput) {
        const r = writeHandoff(args, cfg);
        if (!r.ok) throw new Error(r.error);
        return { ok: true, chars: r.chars, limit: r.limit, text: r.text };
      }
      const info = handoffInfo(cfg);
      return { ok: false, chars: info.chars, limit: info.limit, text: info.text };
    },
  };
}

function toolSearch() {
  return {
    name: 'neuron_search',
    description: 'Search the original text of past sessions (multi-frame zstd archives) by keyword. Use when you need the exact words from an earlier conversation that may have been compacted out of context.',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: { query: { type: 'string', description: '关键词或一句话' }, limit: { type: 'number', description: '最多几条，默认 8' } },
      required: ['query'],
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { count: { type: 'number' }, scanned: { type: 'number' }, items: { type: 'array', items: { type: 'string' } } }, required: ['count', 'scanned', 'items'] },
      render: (_a, v) => textBlock(v.count === 0 ? `（扫描 ${v.scanned} 个会话归档，没有命中）` : `命中 ${v.count} 条（扫描 ${v.scanned} 个会话归档）\n` + v.items.join('\n')),
    },
    execute: async (args) => {
      const r = searchSessions(args?.query, args?.limit);
      return {
        count: r.count,
        scanned: r.scanned,
        items: r.items.map((it) => `- [${String(it.at || '').slice(0, 10)} · ${it.file}] ${String(it.text).slice(0, 200)}`),
      };
    },
  };
}

function toolImportFish() {
  return {
    name: 'neuron_import_fish',
    description: 'Import memories from the dsh-fish-memory plugin store (~/.dsh/fish-memory/*.json) into neuron pools. Idempotent: dedupes by text, so re-running only adds new memories. Long-term facts (stable_profile) go to the core pool.',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { imported: { type: 'number' }, skipped: { type: 'number' }, sessions: { type: 'number' }, error: { type: 'string' } }, required: ['imported', 'skipped', 'sessions'] },
      render: (_a, v) => textBlock(v.error ? `导入失败：${v.error}` : `从鱼的记忆导入 ${v.imported} 条（跳过重复 ${v.skipped} 条，扫描 ${v.sessions} 个会话库）`),
    },
    execute: async () => importFishMemory(loadConfig()),
  };
}

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
      const q = String(args?.query || '');
      await ensureQueryVector(q, cfg);
      await ensureVectors(cfg);
      const hits = recall(q, cfg, { queryVector: queryVectorFor(q) }).slice(0, limit);
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
    handoff: (() => {
      const t = readHandoff().trim();
      let m = null;
      try { m = existsSync(HANDOFF) ? statSync(HANDOFF).mtime.toISOString() : null; } catch { /* ignore */ }
      return { chars: t.length, limit: nowCfg.limits?.handoffMaxChars || 4000, text: t.slice(0, 1200), updatedAt: m };
    })(),
    mood: readMoodBridge(),
    bridges: {
      feiyuMood: existsSync(FEIYU_STATE),
      fishMemory: existsSync(FISH_DIR),
      fishImported: existsSync(FISH_IMPORT_MARK),
    },
    system: collectSystem(),
    sessions: collectSessions(),
    cost: collectCost(),
    plugins: collectPlugins(),
    services,
    chain: collectChainMeta(),
    retrieval: (() => {
      const v = nowCfg.retrieval?.vector || {};
      return {
        enabled: !!v.enabled,
        model: v.model || '',
        blend: Number(v.blend) || 0.5,
        ok: vectorState.ok,
        cached: loadVectors().size,
        lastAt: vectorState.at,
      };
    })(),
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
  // 生态桥 2：首次启动时把「鱼的记忆」导进来（有开关 + 标记文件，只自动跑一次；工具可随时重跑）
  if (cfg.bridges?.fishMemory?.enabled !== false && cfg.bridges?.fishMemory?.autoImport !== false && !existsSync(FISH_IMPORT_MARK)) {
    try {
      const fish = importFishMemory(cfg);
      if (fish.imported > 0) ctx.logger?.info?.(`[neuron-memory] imported ${fish.imported} memories from fish-memory`);
    } catch { /* 导入失败不影响启动 */ }
  }

  const guard = (label, fn) => {
    try { disposers.push(fn()); } catch (error) {
      try { ctx.logger?.warn?.(`[neuron-memory] ${label} register failed: ${error?.message ?? String(error)}`); } catch { /* ignore */ }
    }
  };

  for (const tool of [toolStatus(), toolRecall(), toolRemember(), toolArchive(), toolTouch(), toolPatrol(), toolForget(), toolHandoff(), toolSearch(), toolImportFish()]) {
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

export { loadConfig, saveConfig, recall, patrol, effectiveWeight, lifecycle, poolOf, tokens, DEFAULT_CONFIG, collectPanel, writeHandoff, handoffInfo, searchSessions, enforceLimits, decodeZstdFrames, readMoodBridge, importFishMemory, handoffMinimal, compactHandoff, registerMoodEvent, sentimentOf, touch, ensureVectors, ensureQueryVector, queryVectorFor, cosine };
