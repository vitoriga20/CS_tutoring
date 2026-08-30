// 导入疑似重复匹配器（契约：specs/import-dedup/spec.md §4.1/§5.1，v0.1.0）
// 纯函数、无 Cloudflare/Env 依赖，可单测；只在 BFF 服务端运行（preview 端点集成），
// 前端只消费 suspect 结果做展示与裁决，不内联匹配逻辑（与解析引擎同一原则）。
import type { Gig } from '../types';
import type { GigImportDraft, GigImportRow } from './importParser';

// ── 运行时类型（不入库） ────────────────────────────────────────
// 六项固定比对信号（§5.1 唯一出处）
export type MatchSignal = 'grade_level' | 'subject' | 'district' | 'hourly_rate' | 'student_gender' | 'region';

export interface ImportSuspect {
  gig: Gig;               // 命中的库中 open 单子（完整字段，供对比弹窗展示）
  score: number;          // 命中信号数 0..6
  hard: boolean;          // 编号硬信号是否命中
  matched: MatchSignal[]; // 命中信号名列表，长度 == score
}

// 信号池比对顺序（长度 6）
const SIGNALS: readonly MatchSignal[] = ['grade_level', 'subject', 'district', 'hourly_rate', 'student_gender', 'region'];

// 疑似阈值（§5.1 基线）：hard=true 或 score≥4 为候选；阈值与信号定义随语料实测调优，
// 调整必须走决策后升版本，不得直接改本常量（spec §5.1 阈值调优约束）
const SUSPECT_THRESHOLD = 4;

// ── §4.1 编号提取：标题中首个 ≥6 位数字的裸编号；无 → null ──────
export function extractTitleNo(title: string | null): string | null {
  if (!title) return null;
  const m = title.match(/\d{6,}/);
  return m ? m[0] : null;
}

// ── §5.1 六项信号池 ────────────────────────────────────────────
// 科目：按 · 拆分为集合（顺序无关，「语数英」≈「数学·英语·语文」）
function subjectSet(raw: string | null): Set<string> | null {
  if (!raw) return null;
  const parts = raw.split('·').map((p) => p.trim()).filter((p) => p.length > 0);
  return parts.length > 0 ? new Set(parts) : null;
}

// 地址归一：去全部空白与标点 .,，·、-－—（）()、转小写
function normalizeRegion(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s.,，·、\-－—（）()]/g, '').toLowerCase();
  return s === '' ? null : s;
}

function signalHit(kind: MatchSignal, draft: GigImportDraft, gig: Gig): boolean {
  switch (kind) {
    case 'grade_level':
      // 任一侧 null → 不命中
      return draft.grade_level !== null && draft.grade_level === gig.grade_level;
    case 'subject': {
      const a = subjectSet(draft.subject);
      const b = subjectSet(gig.subject);
      if (!a || !b || a.size !== b.size) return false;
      for (const s of a) if (!b.has(s)) return false;
      return true;
    }
    case 'district':
      // other 为兜底值、无信息量：双方均 other → 不命中（避免大面积误报）
      if (draft.district === 'other' && gig.district === 'other') return false;
      return draft.district === gig.district;
    case 'hourly_rate': {
      const a = draft.hourly_rate;
      const b = gig.hourly_rate;
      // 任一侧 null → 不命中；重发常微调薪资，宽松容忍 |a−b| ≤ 10
      if (a === null || b === null) return false;
      return Math.abs(a - b) <= 10;
    }
    case 'student_gender':
      // unknown 为缺省值、无信息量：双方均 unknown → 不命中
      if (draft.student_gender === 'unknown' && gig.student_gender === 'unknown') return false;
      return draft.student_gender === gig.student_gender;
    case 'region': {
      const a = normalizeRegion(draft.region);
      const b = normalizeRegion(gig.region);
      if (!a || !b) return false;
      // 相等或互为包含
      return a === b || a.includes(b) || b.includes(a);
    }
  }
}

// 硬信号（编号）：双方标题编号均非空且相同 → 无条件候选（不依赖 6 项阈值）
function hardHit(draft: GigImportDraft, gig: Gig): boolean {
  const a = extractTitleNo(draft.title);
  const b = extractTitleNo(gig.title);
  return a !== null && b !== null && a === b;
}

// 一行 vs 单条库中单子：命中信号数与硬信号（硬信号独立于分数，不占 6 项）
function scoreAgainst(
  draft: GigImportDraft,
  gig: Gig,
): { score: number; hard: boolean; matched: MatchSignal[] } {
  const matched: MatchSignal[] = [];
  for (const kind of SIGNALS) {
    if (signalHit(kind, draft, gig)) matched.push(kind);
  }
  return { score: matched.length, hard: hardHit(draft, gig), matched };
}

function isCandidate(r: { score: number; hard: boolean }): boolean {
  return r.hard || r.score >= SUSPECT_THRESHOLD;
}

function isNewer(a: Gig, b: Gig): boolean {
  return Date.parse(a.created_at) - Date.parse(b.created_at) > 0;
}

// ── §4.1 匹配：批内幸存行 vs 库中 open 单子，填 suspect ─────────
// duplicate=true 行恒 null；无候选（hard=false 且 score<4）→ null；
// 多候选取 score 最高者，同分取 created_at 最新者（最新单子更可能是「重发的那条」）。
// 单行匹配异常不影响其他行：异常行按无候选处理并记日志（spec §8 可靠性）。
export function matchSuspects(rows: GigImportRow[], openGigs: Gig[]): GigImportRow[] {
  return rows.map((row) => {
    if (row.duplicate) return { ...row, suspect: null };
    try {
      let best: { gig: Gig; score: number; hard: boolean; matched: MatchSignal[] } | null = null;
      for (const gig of openGigs) {
        const r = scoreAgainst(row.draft, gig);
        if (!isCandidate(r)) continue;
        if (best === null || r.score > best.score || (r.score === best.score && isNewer(gig, best.gig))) {
          best = { gig, ...r };
        }
      }
      return { ...row, suspect: best ? { gig: best.gig, score: best.score, hard: best.hard, matched: best.matched } : null };
    } catch (err) {
      console.error('[dedup] matchSuspects row failed', row.index, err);
      return { ...row, suspect: null };
    }
  });
}
