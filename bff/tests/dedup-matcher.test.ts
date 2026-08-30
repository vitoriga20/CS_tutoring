// 疑似重复匹配器单测（契约：specs/import-dedup/spec.md §4.1/§5.1；覆盖矩阵 TC-DEDUP-002/003/009/010/011/012、PT-DEDUP-01）
// 匹配器为纯函数：直接构造 GigImportRow × Gig 输入，断言 suspect 输出；oracle 与实现分写（属性测试独立复算）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseImport } from '../src/lib/importParser';
import { extractTitleNo, matchSuspects, type ImportSuspect } from '../src/lib/dedupMatcher';
import type { Gig } from '../src/types';
import type { GigImportDraft, GigImportRow } from '../src/lib/importParser';

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hello.txt'), 'utf8');

// ── 快捷构造 ────────────────────────────────────────────────────
let seq = 0;
function gig(over: Partial<Gig> = {}): Gig {
  seq += 1;
  return {
    id: `gig-${seq}`,
    title: '长沙家教网10034639号家教',
    subject: '数学',
    grade_level: 'junior',
    mode: 'offline',
    region: '岳麓区梅溪湖壹号',
    district: 'yuelu',
    hourly_rate: 70,
    student_gender: 'female',
    student_info: '初二、女 基础巩固',
    rate: '70元/小时',
    schedule: null,
    requirements: '有耐心，有方法',
    contact_wxid: null,
    status: 'open',
    published_by: 'p1',
    created_at: '2026-08-29T08:00:00.000Z',
    updated_at: '2026-08-29T08:00:00.000Z',
    ...over,
  };
}

// 无编号标题（避免硬信号干扰阈值类断言）：双方编号均空 → hard 不生效
const TITLE_NO_NO = '初二数学一对一';

function row(over: Partial<GigImportDraft> = {}, extra: Partial<GigImportRow> = {}): GigImportRow {
  return {
    index: 0,
    draft: {
      title: TITLE_NO_NO,
      subject: '数学',
      grade_level: 'junior',
      mode: 'offline',
      region: '岳麓区梅溪湖壹号',
      district: 'yuelu',
      hourly_rate: 70,
      student_gender: 'female',
      student_info: '初二、女 基础巩固',
      rate: '70元/小时',
      schedule: null,
      requirements: '有耐心，有方法',
      contact_wxid: null,
      ...over,
    },
    issues: [],
    duplicate: false,
    status: 'ok',
    ...extra,
  };
}

// 匹配 [draft 覆盖, gig 覆盖] 并返回 suspect（无候选时 null）
function suspectOf(draftOver: Partial<GigImportDraft> = {}, gigOver: Partial<Gig> = {}): ImportSuspect | null {
  return matchSuspects([row(draftOver)], [gig(gigOver)])[0].suspect ?? null;
}

describe('extractTitleNo 编号提取（§4.1）', () => {
  it.each([
    ['8.26长沙家教网10034639号家教', '10034639'],
    ['260827001号4家教', '260827001'],
    ['长沙家教ww260204（开学）', '260204'],
    ['10034639号家教6', '10034639'],
    ['初二数学一对一', null],
    ['', null],
  ] as const)('「%s」→ %s', (title, expected) => {
    expect(extractTitleNo(title)).toBe(expected);
  });
  it('null → null', () => {
    expect(extractTitleNo(null)).toBeNull();
  });
});

describe('TC-DEDUP-010 信号池逐项（§5.1）', () => {
  it('基准：6 项全命中 → score 6、matched 六项', () => {
    const s = suspectOf();
    expect(s).not.toBeNull();
    expect(s!.score).toBe(6);
    expect(s!.matched).toEqual(['grade_level', 'subject', 'district', 'hourly_rate', 'student_gender', 'region']);
  });

  describe('grade_level 年级：enum 相同命中；任一侧 null 不命中', () => {
    it('不同年级 → 掉 1 分且 matched 无 grade_level', () => {
      const s = suspectOf({ grade_level: 'primary' });
      expect(s!.score).toBe(5);
      expect(s!.matched).not.toContain('grade_level');
    });
    it('draft 侧 null → 不命中', () => {
      const s = suspectOf({ grade_level: null });
      expect(s!.score).toBe(5);
    });
  });

  describe('subject 科目：按 · 拆集合相等（顺序无关）', () => {
    it('顺序无关：「英语·语文」vs「语文·英语」→ 命中', () => {
      const s = suspectOf({ subject: '英语·语文' }, { subject: '语文·英语' });
      expect(s!.score).toBe(6);
    });
    it('长尾科目入集合：「数学·长笛」vs「长笛·数学」→ 命中', () => {
      const s = suspectOf({ subject: '数学·长笛' }, { subject: '长笛·数学' });
      expect(s!.score).toBe(6);
    });
    it('集合不同 → 不命中', () => {
      const s = suspectOf({ subject: '物理' });
      expect(s!.score).toBe(5);
      expect(s!.matched).not.toContain('subject');
    });
    it('任一侧 null → 不命中', () => {
      expect(suspectOf({ subject: null })!.score).toBe(5);
      expect(suspectOf({}, { subject: null as unknown as string })!.score).toBe(5);
    });
  });

  describe('district 区县：enum 相同命中；other/other 不命中', () => {
    it('相同区县 → 命中', () => {
      const s = suspectOf({ district: 'yuelu' }, { district: 'yuelu' });
      expect(s!.score).toBe(6);
    });
    it('不同区县 → 不命中', () => {
      const s = suspectOf({ district: 'kaifu' });
      expect(s!.score).toBe(5);
    });
    it('双方均 other → 不命中（兜底值无信息量）', () => {
      const s = suspectOf({ district: 'other' }, { district: 'other' });
      expect(s!.score).toBe(5);
      expect(s!.matched).not.toContain('district');
    });
  });

  describe('hourly_rate 时薪：双方非 null 且 |a−b|≤10', () => {
    it.each([
      [70, 75, true],  // 差 5
      [70, 80, true],  // 差 10（含边界）
      [70, 81, false], // 差 11
      [50, 110, false],
    ] as const)('draft %s vs gig %s → %s', (a, b, hit) => {
      const s = suspectOf({ hourly_rate: a }, { hourly_rate: b });
      expect(s!.score).toBe(hit ? 6 : 5);
      if (!hit) expect(s!.matched).not.toContain('hourly_rate');
    });
    it('任一侧 null → 不命中', () => {
      expect(suspectOf({ hourly_rate: null })!.score).toBe(5);
      expect(suspectOf({}, { hourly_rate: null })!.score).toBe(5);
    });
  });

  describe('student_gender 性别：enum 相同命中；unknown/unknown 不命中', () => {
    it('相同性别 → 命中', () => {
      const s = suspectOf({ student_gender: 'male' }, { student_gender: 'male' });
      expect(s!.score).toBe(6);
    });
    it('不同性别 → 不命中', () => {
      const s = suspectOf({ student_gender: 'male' });
      expect(s!.score).toBe(5);
    });
    it('双方均 unknown → 不命中（缺省值无信息量）', () => {
      const s = suspectOf({ student_gender: 'unknown' }, { student_gender: 'unknown' });
      expect(s!.score).toBe(5);
      expect(s!.matched).not.toContain('student_gender');
    });
  });

  describe('region 地址：归一后相等或互为包含', () => {
    it('归一相等：空格/点/标点差异折叠后相等 → 命中', () => {
      const s = suspectOf({ region: '岳麓区 梅溪湖壹号' }, { region: '岳麓区.梅溪湖壹号' });
      expect(s!.score).toBe(6);
    });
    it('互包含：draft 为 gig 子串 → 命中', () => {
      const s = suspectOf({ region: '梅溪湖壹号' });
      expect(s!.score).toBe(6);
    });
    it('归一后不同 → 不命中', () => {
      const s = suspectOf({ region: '海南省海口市某小区' });
      expect(s!.score).toBe(5);
      expect(s!.matched).not.toContain('region');
    });
    it('任一侧 null → 不命中', () => {
      expect(suspectOf({ region: null })!.score).toBe(5);
      expect(suspectOf({}, { region: null as unknown as string })!.score).toBe(5);
    });
  });
});

describe('TC-DEDUP-003 阈值边界：≥4 疑似、<4 不疑似', () => {
  // 基准 6 命中；减 2 项 → 4/6（疑似）；再减 1 项 → 3/6（不疑似）
  const FOUR_OVER: Partial<GigImportDraft> = { subject: '物理', region: '海南省海口市某小区' };
  it('4/6 → suspect 非空、score 4', () => {
    const s = suspectOf(FOUR_OVER);
    expect(s).not.toBeNull();
    expect(s!.score).toBe(4);
    expect(s!.hard).toBe(false);
  });
  it('3/6 → suspect 为 null（hard 未命中）', () => {
    const s = suspectOf({ ...FOUR_OVER, student_gender: 'unknown' });
    expect(s).toBeNull();
  });
  it('双方无编号时硬信号不生效：4 分命中靠阈值，3 分不疑似', () => {
    const g = gig({ title: TITLE_NO_NO });
    const four = matchSuspects([row({ ...FOUR_OVER, title: TITLE_NO_NO })], [g])[0];
    expect(four.suspect?.score).toBe(4);
    const three = matchSuspects([row({ ...FOUR_OVER, student_gender: 'unknown', title: TITLE_NO_NO })], [g])[0];
    expect(three.suspect).toBeNull();
  });
});

describe('TC-DEDUP-002 编号硬信号（字段全变也可命中）', () => {
  it('双方标题同编号、其余字段全不同 → suspect 非空、hard=true、score 0', () => {
    const s = suspectOf({ title: '长沙家教网10034639号家教' }, {
      title: '长沙家教网10034639号家教',
      subject: '生物',
      grade_level: 'college',
      region: '开福区.珠江好世界',
      district: 'kaifu',
      hourly_rate: 50,
      student_gender: 'male',
    });
    expect(s).not.toBeNull();
    expect(s!.hard).toBe(true);
    expect(s!.score).toBe(0);
    expect(s!.matched).toEqual([]);
  });
  it('编号不同 → 硬信号不命中（仅走阈值）', () => {
    const s = suspectOf({ title: '长沙家教网10034640号家教' });
    // 字段全同但编号不同 → 6 分命中（阈值路径），hard 为 false
    expect(s).not.toBeNull();
    expect(s!.hard).toBe(false);
    expect(s!.score).toBe(6);
  });
});

describe('TC-DEDUP-011 多候选：取 score 最高，同分取 created_at 最新', () => {
  const PARTIAL: Partial<GigImportDraft> = { subject: '物理', region: '海南省海口市某小区' }; // 与候选均 4/6
  it('同分 → 指向 created_at 较新者', () => {
    const older = gig({ id: 'older', title: TITLE_NO_NO, created_at: '2026-08-29T08:00:00.000Z' });
    const newer = gig({ id: 'newer', title: TITLE_NO_NO, created_at: '2026-08-29T09:00:00.000Z' });
    const out = matchSuspects([row({ ...PARTIAL, title: TITLE_NO_NO })], [older, newer])[0];
    expect(out.suspect?.gig.id).toBe('newer');
    expect(out.suspect?.score).toBe(4);
  });
  it('不同分 → 指向 score 更高者', () => {
    const low = gig({ id: 'low', title: TITLE_NO_NO, subject: '物理' }); // 5/6
    const high = gig({ id: 'high', title: TITLE_NO_NO });               // 6/6
    const out = matchSuspects([row({ title: TITLE_NO_NO })], [low, high])[0];
    expect(out.suspect?.gig.id).toBe('high');
    expect(out.suspect?.score).toBe(6);
  });
});

describe('TC-DEDUP-009（匹配器级）duplicate 行恒 suspect=null；批内重复行不参与库比对', () => {
  it('duplicate=true 行与库中全命中也不疑似', () => {
    const dup = row({}, { duplicate: true });
    const out = matchSuspects([dup], [gig()])[0];
    expect(out.suspect).toBeNull();
  });
  it('非 duplicate 行正常疑似，不影响 duplicate 行', () => {
    const rows = [row({}, { index: 0 }), row({}, { index: 1, duplicate: true })];
    const out = matchSuspects(rows, [gig()]);
    expect(out[0].suspect).not.toBeNull();
    expect(out[1].suspect).toBeNull();
  });
});

describe('spec §8 可靠性：单行匹配异常按无候选处理且不影响其他行', () => {
  it('draft 访问即抛错的行 suspect=null，正常行不受影响', () => {
    const boomDraft = new Proxy(row().draft, { get() { throw new Error('boom'); } });
    const boomRow: GigImportRow = { index: 1, draft: boomDraft, issues: [], duplicate: false, status: 'ok' };
    const out = matchSuspects([row({}, { index: 0 }), boomRow], [gig()]);
    expect(out[0].suspect).not.toBeNull();
    expect(out[1].suspect).toBeNull();
  });
});

describe('PT-DEDUP-01 属性：候选 ⇔ 阈值；指向最高分/最新；duplicate 恒 null', () => {
  // 独立 oracle：逐项直接比较（与实现分写）
  function setEq(a: string, b: string): boolean {
    const pa = a.split('·').map((s) => s.trim()).filter(Boolean);
    const pb = b.split('·').map((s) => s.trim()).filter(Boolean);
    if (pa.length !== pb.length) return false;
    return pa.every((s) => pb.includes(s));
  }
  function normRegion(r: string): string {
    return r.replace(/[\s.,，·、\-－—（）()]/g, '').toLowerCase();
  }
  function oracleScore(d: GigImportDraft, g: Gig): number {
    let n = 0;
    if (d.grade_level !== null && d.grade_level === g.grade_level) n++;
    if (d.subject !== null && g.subject !== null && setEq(d.subject, g.subject)) n++;
    if (d.district !== 'other' || g.district !== 'other') {
      if (d.district === g.district) n++;
    }
    if (d.hourly_rate !== null && g.hourly_rate !== null && Math.abs(d.hourly_rate - g.hourly_rate) <= 10) n++;
    if (d.student_gender !== 'unknown' || g.student_gender !== 'unknown') {
      if (d.student_gender === g.student_gender) n++;
    }
    if (d.region !== null && g.region !== null) {
      const a = normRegion(d.region);
      const b = normRegion(g.region);
      if (a === b || a.includes(b) || b.includes(a)) n++;
    }
    return n;
  }
  function oracleHard(d: GigImportDraft, g: Gig): boolean {
    const a = d.title?.match(/\d{6,}/)?.[0] ?? null;
    const b = g.title.match(/\d{6,}/)?.[0] ?? null;
    return a !== null && b !== null && a === b;
  }

  // 确定性 LCG（不新增依赖；种子固定 → 用例可复现）
  let seed = 42;
  function rand(n: number): number {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  }
  function pick<T>(arr: readonly T[]): T {
    return arr[rand(arr.length)];
  }
  const TITLES = ['长沙家教网10034639号家教', '260827001号4家教', TITLE_NO_NO, '初二数学一对一', '长沙家教ww260204（开学）'];
  const SUBJECTS = ['数学', '数学·物理·化学', '物理', '英语·语文', '语文·数学·英语', '数学·物理', null];
  const GRADES = ['primary', 'junior', 'senior', 'college', null] as const;
  const REGIONS = ['岳麓区梅溪湖壹号', '北部湾', '雨花区.才子嘉都', '海南省海口市某小区', '开福区.珠江好世界', null];
  const DISTRICTS = ['yuelu', 'kaifu', 'furong', 'other', 'wangcheng'] as const;
  const RATES = [50, 60, 70, 75, 80, 90, 100, 110, null] as const;
  const GENDERS = ['male', 'female', 'unknown'] as const;
  function randDraft(): GigImportDraft {
    return {
      title: pick(TITLES),
      subject: pick(SUBJECTS),
      grade_level: pick(GRADES),
      mode: 'offline',
      region: pick(REGIONS),
      district: pick(DISTRICTS),
      hourly_rate: pick(RATES),
      student_gender: pick(GENDERS),
      student_info: '随机',
      rate: null,
      schedule: null,
      requirements: '随机',
      contact_wxid: null,
    };
  }
  function randGig(): Gig {
    const d = randDraft();
    return {
      id: `g-${rand(1e9)}`,
      title: d.title ?? '',
      subject: d.subject ?? '',
      grade_level: (d.grade_level ?? 'primary'),
      mode: 'offline',
      region: d.region ?? '',
      district: d.district,
      hourly_rate: d.hourly_rate,
      student_gender: d.student_gender,
      student_info: '随机',
      rate: null,
      schedule: null,
      requirements: '随机',
      contact_wxid: null,
      status: 'open',
      published_by: 'p',
      created_at: new Date(Date.UTC(2026, 7, 29, 8) + rand(24 * 3600 * 1000)).toISOString(),
      updated_at: '2026-08-29T08:00:00.000Z',
    };
  }

  it('300 轮随机：候选 ⇔ 阈值；指向最高分/最新；duplicate 恒 null', () => {
    for (let iter = 0; iter < 300; iter++) {
      const nRows = 1 + rand(4);
      const nGigs = 2 + rand(5);
      const rows: GigImportRow[] = Array.from({ length: nRows }, (_, i) => ({
        ...row(randDraft(), { index: i, duplicate: rand(5) === 0 }),
      }));
      const gigs = Array.from({ length: nGigs }, randGig);
      const out = matchSuspects(rows, gigs);
      for (const r of out) {
        if (r.duplicate) {
          expect(r.suspect, `iter=${iter} duplicate 行`).toBeNull();
          continue;
        }
        const candidates = gigs.filter((g) => oracleHard(r.draft, g) || oracleScore(r.draft, g) >= 4);
        if (candidates.length === 0) {
          expect(r.suspect, `iter=${iter} 无候选应 null`).toBeNull();
          continue;
        }
        const best = candidates.reduce((m, g) => {
          const ms = oracleScore(r.draft, m);
          const gs = oracleScore(r.draft, g);
          if (gs > ms) return g;
          if (gs < ms) return m;
          return Date.parse(g.created_at) > Date.parse(m.created_at) ? g : m;
        }, candidates[0]);
        expect(r.suspect, `iter=${iter} index=${r.index}`).not.toBeNull();
        expect(r.suspect!.gig.id).toBe(best.id);
        expect(r.suspect!.score).toBe(oracleScore(r.draft, best));
        expect(r.suspect!.hard).toBe(oracleHard(r.draft, best));
        expect(r.suspect!.matched.length).toBe(r.suspect!.score);
      }
    }
  });
});

describe('spec §8 性能：200 行 × 库中 5000 条 open 单子 < 2s（NFR 实测，数值记入 checklist）', () => {
  it('matchSuspects(200 行, 5000 单) 计时（匹配器为 preview 全链路的新增成本；解析基线 SPEC-002 ~5ms）', () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row({ title: `长沙家教网${10000000 + i}号家教` }, { index: i }),
    );
    const gigs = Array.from({ length: 5000 }, (_, i) =>
      gig({ id: `g-${i}`, title: `长沙家教网${20000000 + i}号家教` }),
    );
    const t0 = performance.now();
    const out = matchSuspects(rows, gigs);
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[NFR] 200 行 × 5000 open 单子 matchSuspects = ${ms.toFixed(1)}ms`);
    expect(ms).toBeLessThan(2000);
    expect(out).toHaveLength(200);
    expect(out.every((r) => r.suspect !== null)).toBe(true); // 全字段命中 → 均有候选
  });
});

describe('TC-DEDUP-012 语料自比对（你好.txt，误报率 oracle）', () => {
  function toGig(d: GigImportDraft, i: number): Gig {
    const t = new Date(Date.UTC(2026, 7, 29, 8) + i * 60000).toISOString();
    return {
      id: `g-${i}`,
      title: d.title ?? '',
      subject: d.subject ?? '',
      grade_level: d.grade_level ?? 'primary',
      mode: d.mode,
      region: d.region ?? '',
      district: d.district,
      hourly_rate: d.hourly_rate,
      student_gender: d.student_gender,
      student_info: d.student_info ?? '',
      rate: d.rate,
      schedule: d.schedule,
      requirements: d.requirements ?? '',
      contact_wxid: d.contact_wxid,
      status: 'open',
      published_by: 'p',
      created_at: t,
      updated_at: t,
    };
  }

  it('同源第二遍全部幸存行 suspect 非 null（编号硬信号兜底）', () => {
    const first = parseImport(FIXTURE);
    const survivors = first.filter((r) => !r.duplicate);
    expect(survivors.length).toBeGreaterThan(100); // 语料规模守卫
    const openGigs = survivors.map((r, i) => toGig(r.draft, i));
    const second = matchSuspects(first, openGigs);
    for (const r of second.filter((x) => !x.duplicate)) {
      expect(r.suspect, `index=${r.index} title=${r.draft.title}`).not.toBeNull();
    }
  });

  it('打乱字段对照批次疑似率显著低于全量（误报上限观测，数值记入 checklist）', () => {
    const first = parseImport(FIXTURE);
    const survivors = first.filter((r) => !r.duplicate);
    const openGigs = survivors.map((r, i) => toGig(r.draft, i));
    const full = matchSuspects(first, openGigs).filter((r) => !r.duplicate);
    const fullRate = full.filter((r) => r.suspect).length / full.length;

    // 打乱：标题编号替换（破硬信号）+ 年级/区县/性别/地址换成不相关值
    const scrambled: GigImportRow[] = survivors.map((r, i) => ({
      ...r,
      draft: {
        ...r.draft,
        title: r.draft.title?.replace(/\d{6,}/, String(10000000 + i)) ?? `无编号${i}`,
        grade_level: 'college',
        district: 'other',
        student_gender: 'unknown',
        region: `海南省海口市某小区${i}`,
      },
      suspect: null,
    }));
    const scrambledOut = matchSuspects(scrambled, openGigs);
    const scrambledRate = scrambledOut.filter((r) => r.suspect).length / scrambledOut.length;
    // eslint-disable-next-line no-console
    console.log(
      `[TC-DEDUP-012] 总行=${first.length} 幸存=${survivors.length} 全量疑似率=${(fullRate * 100).toFixed(1)}% 打乱疑似率=${(scrambledRate * 100).toFixed(1)}%`,
    );
    expect(fullRate).toBeGreaterThanOrEqual(0.95);
    expect(scrambledRate).toBeLessThan(0.2);
  });
});
