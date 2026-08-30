// 批量导入解析引擎（契约：specs/gig-import/spec.md §4.1/§5.1，v0.1.1 修订版）
// 纯函数、无 Cloudflare/Env 依赖，可单测；只在 BFF 服务端运行（预览接口返回结果），
// 前端不内联解析逻辑，避免逻辑双份与暴露规则。
import type { District, GradeLevel, LessonMode, StudentGender } from '../types';
import type { FieldIssue } from './validators';

// ── 运行时类型（不入库） ────────────────────────────────────────
// 草稿：字段可能缺失/未解析（null/空串），与 validators.GigCreate 字段集一致
export interface GigImportDraft {
  title: string | null;
  subject: string | null;
  grade_level: GradeLevel | null;
  mode: LessonMode;
  region: string | null;
  district: District;
  hourly_rate: number | null;
  student_gender: StudentGender;
  student_info: string | null;
  rate: string | null;
  schedule: string | null;
  requirements: string | null;
  contact_wxid: string | null;
}

export interface GigImportRow {
  index: number;
  draft: GigImportDraft;
  issues: FieldIssue[];
  duplicate: boolean;
  status: 'ok' | 'error';
}

// ── 常量与规则表（§5.1 唯一出处） ───────────────────────────────
const MAX = { title: 60, subject: 40, region: 40, student_info: 500, rate: 40, schedule: 120, requirements: 2000 };

// 标签行（分隔符支持全角/半角冒号与逗号；长标签先于短标签）
// 短标签变体（v0.1.3）：【地址】【科目】【时间】【要求】【报酬】【薪资】——家教网抓取文本的另一种标签形态
const LABELS = [
  '【具体地点】', '【年级科目】', '【每周课次】', '【大概要求】', '【课时薪酬】',
  '【地址】', '【科目】', '【时间】', '【要求】', '【报酬】', '【薪资】',
  '学员情况', '学员地址', '家教地址', '具体地点', '地点',
  '辅导科目', '年级科目', '时间安排', '每周课次',
  '教员要求', '老师要求', '大概要求', '要求', '老师薪水', '课时薪酬',
  '工作内容', '工作时间', '【试课时间】',
];
// 标签行判定（v0.1.3）：方括号标签（【地址】…）可直接接值（无分隔符，】即边界）；
// 普通标签（学员地址…）需冒号/逗号分隔，避免把正文行误当标签
const LABEL_LINE_RE = new RegExp(`^(${LABELS.join('|')})(?:\\s*[:：，,]|(?<=】))`);
const LABEL_VALUE_RE = new RegExp(`^(${LABELS.join('|')})(?:\\s*[:：，,]\\s*|(?<=】)\\s*)(.*)$`);

// 标题行：含「长沙家教 / 家教网 / 号\d{0,2}家教」或裸编号（≥6 位数字）；
// 聊天噪声（如「…开学的家教，大家有时…」）不含以上形态，作为正文并入前块
const TITLE_RE = /长沙家教|家教网|号\d{0,2}家教|^\d{6,}$/;
// 纯 emoji/装饰行（无 CJK/字母/数字）：跳过
const EMOJI_ONLY_RE = /^[^\u4e00-\u9fa5A-Za-z0-9：:。，,、（）()·.\-+\/]+$/;

// 年级词→enum（顺序即优先级：college 先于「X年级」（大学一年级≠一年级）；准X 简写、升/进、学生段 收尾）
const GRADE_RULES: ReadonlyArray<{ re: RegExp; level: GradeLevel }> = [
  { re: /准?大[一二三四]|大学/, level: 'college' },
  { re: /准?[一二三四五六]年级/, level: 'primary' },
  { re: /准?初[一二三]/, level: 'junior' },
  { re: /准?高[一二三]/, level: 'senior' },
  { re: /[一二三四五六](升|进)[一二三四五六]/, level: 'primary' }, // 四升五 / 三升四 / 二进三
  { re: /准[一二三四五六]/, level: 'primary' }, // 「准五」简写（无「年级」后缀）
  { re: /小学生/, level: 'primary' },
  { re: /初中生/, level: 'junior' },
  { re: /高中生/, level: 'senior' },
];

// 科目全称与缩写（§5.1 v0.1.1 归一算法）
const SUBJECT_FULL: readonly string[] = ['语文', '数学', '英语', '物理', '化学', '生物', '政治', '历史', '地理', '全科', '奥数'];
const SUBJECT_ABBR: Record<string, string> = {
  语: '语文', 数: '数学', 英: '英语', 物: '物理', 化: '化学',
  生: '生物', 政: '政治', 史: '历史', 地: '地理', 理: '物理',
};

// 区县：① 前缀正则 → enum；② 值内区县词兜底（「长沙市开福区…」→ kaifu，v0.1.3）；
// ③ 手工映射表（复用 0003 已核实 8 条）；④ other 兜底
const DISTRICT_PREFIX: ReadonlyArray<[RegExp, District]> = [
  [/^芙蓉区/, 'furong'],
  [/^天心区/, 'tianxin'],
  [/^雨花区/, 'yuhua'],
  [/^开福区/, 'kaifu'],
  [/^岳麓区/, 'yuelu'],
  [/^望城区/, 'wangcheng'],
  [/^长沙县/, 'changsha_county'],
];
const DISTRICT_INNER: ReadonlyArray<[RegExp, District]> = [
  [/芙蓉区/, 'furong'],
  [/天心区/, 'tianxin'],
  [/雨花区/, 'yuhua'],
  [/开福区/, 'kaifu'],
  [/岳麓区/, 'yuelu'],
  [/望城区/, 'wangcheng'],
  [/长沙县/, 'changsha_county'],
];
const DISTRICT_MANUAL: Record<string, District> = {
  北部湾: 'wangcheng',
  '汉唐·翰林府1期': 'yuelu',
  '长沙地铁4号线观沙岭站附近': 'yuelu',
  君康家园: 'yuelu',
  '长沙火车站附近': 'furong',
  '润和星河玥8栋': 'yuhua',
  保利天汇二期: 'yuhua',
  长郡外国语附近: 'tianxin',
};

// ── §4.1 切分：整段文本按单子边界切成 N 个单子块 ────────────────
export function segmentText(raw: string): string[] {
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue; // 注释行
    if (EMOJI_ONLY_RE.test(line)) continue; // 纯 emoji 装饰行
    // 通告/注释行：剥行首装饰（emoji 等，保留 #）后为 # 注释（如「📘 #开学单已秒 …」）
    const stripped = line.replace(/^[^\u4e00-\u9fa5A-Za-z0-9#]+/, '');
    if (stripped.startsWith('#')) continue;
    if (!LABEL_LINE_RE.test(line) && TITLE_RE.test(line)) {
      if (cur.length > 0) blocks.push(cur.join('\n'));
      cur = [line];
    } else if (cur.length === 0) {
      // 块尚未开始（首个标题前的聊天/广告噪声行）：丢弃，不单独成块（v0.1.3）
      continue;
    } else {
      cur.push(line);
    }
  }
  if (cur.length > 0) blocks.push(cur.join('\n'));
  return blocks;
}

// ── 工具 ────────────────────────────────────────────────────────
function truncate(s: string | null, max: number): string | null {
  if (s === null) return null;
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function clampRate(n: number): number {
  return Math.min(10000, Math.max(0, n));
}

// 时薪（§5.1）：区间取下限；数字+（元|/小时|每小时|一小时|块|左右|/h）；
// 数字+元 后紧跟 次/天/月/一次课 → 按次/天/月计费 → null；
// 「每(次|天|周|月)…元」句式（如「每次薪资100元」）→ 按次/天计费 → null（v0.1.3）
function extractHourlyRate(rateText: string | null): number | null {
  if (!rateText) return null;
  if (/每(次|天|周|月)[^0-9]{0,8}\d+\s*元/.test(rateText)) return null; // 按次/天/周/月计费
  const range = rateText.match(/(\d{1,5})\s*[-~～]\s*(\d{1,5})\s*(?:元|\/小时|每小时|\/h)/);
  if (range) return clampRate(parseInt(range[1], 10));
  const single = rateText.match(/(\d{1,5})\s*(?:元|\/小时|每小时|一小时|块|左右|\/h)/);
  if (!single) return null;
  const after = rateText.slice((single.index ?? 0) + single[0].length);
  if (/^(次|\/次|\/天|\/月|\/一次课|\/课时)/.test(after)) return null; // 按次/天/月计费
  return clampRate(parseInt(single[1], 10));
}

// 科目归一（§5.1 v0.1.1）：分词、全称优先、缩写段展开、· 连接、长尾原样
export function normalizeSubject(raw: string | null): string | null {
  if (raw === null) return null;
  let s = raw.trim();
  // 剥年级词段（「【年级科目】：三年级 全科」→ 全科）
  s = s.replace(/(准?[一二三四五六]年级|准?初[一二三]|准?高[一二三]|准?大[一二三四]|大学)\s*/g, '').trim();
  if (s === '') return null;
  // 「一个…一个」且无任何标准科目词 → 模糊，留 issue（§5.1 ⑥）
  if (s.includes('一个') && !SUBJECT_FULL.some((f) => s.includes(f))) return null;
  // 纯缩写串（含单字如「语」）→ 逐字展开、· 连接
  if (/^[语数英理化生政史地]+$/.test(s)) {
    return truncate(
      s.split('').map((c) => SUBJECT_ABBR[c]).join('·'),
      MAX.subject,
    );
  }

  const out: string[] = [];
  let lastSubject = false;
  let i = 0;
  while (i < s.length) {
    const full = SUBJECT_FULL.find((f) => s.startsWith(f, i));
    if (full) {
      if (lastSubject) out.push('·');
      out.push(full);
      lastSubject = true;
      i += full.length;
      continue;
    }
    const ch = s[i];
    const prevAbbr = i > 0 && ch in SUBJECT_ABBR && s[i - 1] in SUBJECT_ABBR;
    const nextAbbr = i + 1 < s.length && s[i + 1] in SUBJECT_ABBR;
    if (ch in SUBJECT_ABBR && (prevAbbr || nextAbbr || lastSubject)) {
      if (lastSubject) out.push('·');
      out.push(SUBJECT_ABBR[ch]);
      lastSubject = true;
    } else {
      out.push(ch);
      lastSubject = false;
    }
    i += 1;
  }
  return truncate(out.join(''), MAX.subject);
}

function extractGradeLevel(...sources: Array<string | null>): GradeLevel | null {
  for (const src of sources) {
    if (!src) continue;
    for (const { re, level } of GRADE_RULES) {
      if (re.test(src)) return level;
    }
  }
  return null;
}
function extractGender(studentInfo: string | null): StudentGender {
  if (!studentInfo) return 'unknown';
  if (/不限/.test(studentInfo)) return 'unknown';
  if (/女/.test(studentInfo)) return 'female';
  if (/男/.test(studentInfo)) return 'male';
  return 'unknown';
}

function extractDistrict(region: string | null): District {
  if (!region) return 'other';
  for (const [re, d] of DISTRICT_PREFIX) {
    if (re.test(region)) return d;
  }
  // 值内区县词兜底（「长沙市开福区清水塘路…」→ kaifu，v0.1.3）；前缀优先避免歧义
  for (const [re, d] of DISTRICT_INNER) {
    if (re.test(region)) return d;
  }
  return DISTRICT_MANUAL[region] ?? 'other';
}

// 去重键（§5.1 title 行 v0.1.1）：剥装饰前缀 → 去「号家教+尾随数字」→ 去空格/点/小写
export function dedupKey(title: string): string {
  let s = title.trim();
  for (let guard = 0; guard < 4; guard++) {
    const before = s;
    s = s.replace(/^[^\u4e00-\u9fa5A-Za-z0-9#]+/, ''); // emoji/装饰串（保留 #）
    s = s.replace(/^#\S*/, ''); // #注释段（如「#开学单已秒」）
    if (s === before) break;
  }
  s = s.replace(/^推/, '');
  s = s.replace(/^\d{1,2}\.\d{1,2}/, ''); // 日期前缀（8.26）
  s = s.replace(/号家教\d*/, ''); // 「号家教+尾随数字」；不动「号4家教」形态
  return s.replace(/[\s.·]/g, '').toLowerCase();
}

// ── §4.1 抽取+归一：单子块 → 草稿 ───────────────────────────────
export function parseGigBlock(block: string): GigImportDraft {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const title = truncate(lines[0] ?? null, MAX.title);

  const pick = (label: string): string | null => {
    for (const line of lines) {
      const m = line.match(LABEL_VALUE_RE);
      if (m && m[1] === label && m[2].trim() !== '') return m[2].trim();
    }
    return null;
  };

  const studentInfo = truncate(pick('学员情况'), MAX.student_info) ?? fallbackStudentInfo(lines.slice(1));
  const subjectValue = pick('辅导科目') ?? pick('年级科目') ?? pick('【年级科目】') ?? pick('【科目】');
  const subject = normalizeSubject(subjectValue);
  const region =
    truncate(
      pick('学员地址') ?? pick('家教地址') ?? pick('具体地点') ?? pick('【具体地点】') ?? pick('地点') ?? pick('【地址】'),
      MAX.region,
    );
  const rate = truncate(pick('老师薪水') ?? pick('课时薪酬') ?? pick('【课时薪酬】') ?? pick('【报酬】') ?? pick('【薪资】'), MAX.rate);
  const schedule = truncate(pick('时间安排') ?? pick('每周课次') ?? pick('【每周课次】') ?? pick('【时间】'), MAX.schedule);
  const requirements = truncate(
    pick('教员要求') ?? pick('老师要求') ?? pick('大概要求') ?? pick('【大概要求】') ?? pick('要求') ?? pick('【要求】'),
    MAX.requirements,
  );
  const blockText = block;

  return {
    title,
    subject,
    grade_level: extractGradeLevel(studentInfo, subjectValue, region),
    mode: /线上|网课|直播/.test(blockText) ? 'online' : 'offline',
    region,
    district: extractDistrict(region),
    hourly_rate: extractHourlyRate(rate),
    student_gender: extractGender(studentInfo),
    student_info: studentInfo,
    rate,
    schedule,
    requirements,
    contact_wxid: null, // v1 不提取（§5.1）
  };
}

// 无「学员情况」标签时取块内描述性段落：首个非标签、非标题、非编号列表的正文行
function fallbackStudentInfo(contentLines: string[]): string | null {
  for (const line of contentLines) {
    if (LABEL_LINE_RE.test(line)) continue;
    if (/^\d+[.、]/.test(line)) continue;
    if (EMOJI_ONLY_RE.test(line)) continue;
    return truncate(line, MAX.student_info);
  }
  return null;
}

// ── §4.1 去重标记：按去重键归一，首条保留、其余 duplicate=true ──
export function markDuplicates(drafts: GigImportDraft[]): GigImportRow[] {
  const seen = new Set<string>();
  return drafts.map((draft, index) => {
    const key = draft.title ? dedupKey(draft.title) : `#raw${index}`;
    const duplicate = seen.has(key);
    seen.add(key);
    return { index, draft, issues: [], duplicate, status: 'ok' as const };
  });
}

// ── §5.2 校验：必填缺失/非法 → issue（行 status=error） ─────────
export function collectIssues(draft: GigImportDraft): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!draft.title) issues.push({ field: 'title', reason: '未识别标题' });
  if (!draft.subject) issues.push({ field: 'subject', reason: '未识别科目' });
  if (!draft.grade_level) issues.push({ field: 'grade_level', reason: '未识别年级' });
  if (!draft.region) issues.push({ field: 'region', reason: '未识别地点' });
  if (!draft.student_info) issues.push({ field: 'student_info', reason: '未识别学员情况' });
  if (!draft.requirements) issues.push({ field: 'requirements', reason: '未识别教员要求' });
  return issues;
}

// ── §4.1 组合：segment → parse → dedup → issues ─────────────────
export function parseImport(raw: string): GigImportRow[] {
  const drafts = segmentText(raw).map(parseGigBlock);
  return markDuplicates(drafts).map((row) => {
    const issues = collectIssues(row.draft);
    return { ...row, issues, status: issues.length > 0 ? ('error' as const) : ('ok' as const) };
  });
}
