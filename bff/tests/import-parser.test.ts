// 解析引擎单测（契约：specs/gig-import/spec.md §4.1/§5.1 v0.1.1；覆盖矩阵 TC-IMPORT-007/008、PT-IMPORT-01/02）
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectIssues,
  dedupKey,
  normalizeSubject,
  parseGigBlock,
  parseImport,
  segmentText,
  type GigImportDraft,
} from '../src/lib/importParser';

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hello.txt'), 'utf8');

// 快捷构造：块文本 → 草稿
function draft(block: string): GigImportDraft {
  return parseGigBlock(block);
}

describe('TC-IMPORT-007 字段映射（spec §5.1 全部示例）', () => {
  describe('grade_level 年级→enum', () => {
    it.each([
      ['初二、女 基础巩固', 'junior'],
      ['准高一、女', 'senior'],
      ['六年级、男', 'primary'],
      ['大一、女', 'college'],
      ['准五、男，阅读理解', 'primary'], // 准X 简写（无「年级」后缀）
      ['大学一年级', 'college'],
      ['四升五、女，提升', 'primary'], // 升/进 过渡写法
      ['三升四哥哥，一升二弟弟', 'primary'],
      ['二进三、女', 'primary'],
      ['幼儿、女', null], // 未命中 → null（留 issue）
      ['小学', null], // 裸词 → null（留 issue）
    ] as const)('学员情况「%s」→ %s', (info, expected) => {
      const block = `8.26长沙家教网10034639号家教\n学员情况：${info}\n辅导科目：数学\n学员地址：岳麓区梅溪湖\n教员要求：有耐心`;
      expect(draft(block).grade_level).toBe(expected);
    });
  });

  describe('subject 科目归一（v0.1.1 修订算法）', () => {
    it.each([
      ['语数英', '语文·数学·英语'],
      ['数理化', '数学·物理·化学'],
      ['数学物理', '数学·物理'],
      ['语数英（英语）', '语文·数学·英语（英语）'],
      ['数学物理化学', '数学·物理·化学'],
      ['英语数学', '英语·数学'],
      ['长笛', '长笛'], // 长尾实义值原样
      ['教正姿，写硬笔字', '教正姿，写硬笔字'],
      ['理科', '理科'],
      ['全科辅导', '全科辅导'],
      ['语文', '语文'],
      ['英语、物理（各一位）', '英语、物理（各一位）'],
    ])('「%s」→「%s」', (raw, expected) => {
      expect(normalizeSubject(raw)).toBe(expected);
    });

    it('模糊表述「文科一个 理科一个」→ null（留 issue）', () => {
      expect(normalizeSubject('文科一个 理科一个')).toBeNull();
      const block = `长沙家教网10034639号家教\n辅导科目：文科一个 理科一个\n学员情况：初二、女\n学员地址：北部湾\n教员要求：女老师`;
      const d = draft(block);
      expect(d.subject).toBeNull();
      expect(collectIssues(d)).toContainEqual({ field: 'subject', reason: expect.any(String) });
    });

  it('「【年级科目】：三年级 全科」→ 年级剥离后 subject=全科、grade=primary', () => {
    const block = `🌟长沙家教ww260204（开学）\n【具体地点】：君康家园\n【年级科目】：三年级 全科\n【课时薪酬】：60一小时一次两个小时`;
    const d = draft(block);
    expect(d.subject).toBe('全科');
    expect(d.grade_level).toBe('primary');
    expect(d.region).toBe('君康家园');
  });

  it('标签分隔符支持逗号（教员要求，）与方括号标签（【大概要求】）', () => {
    const block = `长沙家教网10034669号家教\n学员地址：天心区.北辰\n辅导科目：语文\n学员情况：二年级、男孩\n教员要求，语文看图写话引导 细心耐心 有责任心。`;
    const d = draft(block);
    expect(d.requirements).toContain('语文看图写话引导');
    expect(d.district).toBe('tianxin');
  });

  it('学员地址含「小学生」→ grade=primary（地址作为年级兜底来源）', () => {
    const block = `🍵🍵🍵🍵长沙家教网10034540号家教\n学员地址：雨花区.新尤达校外托管 小学生\n辅导科目：作业辅导\n学员情况：1．作业检查纠正\n教员要求：男女不限，有家教经验`;
    const d = draft(block);
    expect(d.grade_level).toBe('primary');
  });
  });

  describe('district 区县', () => {
    it.each([
      ['岳麓区.梅溪湖壹号', 'yuelu'],
      ['雨花区.才子嘉都', 'yuhua'],
      ['开福区.珠江好世界', 'kaifu'],
      ['天心区.星城荣域', 'tianxin'],
      ['芙蓉区.马王堆', 'furong'],
      ['望城区.荣盛岳麓峰景', 'wangcheng'],
      ['长沙县.某小区', 'changsha_county'],
      ['北部湾', 'wangcheng'], // 手工映射表
      ['汉唐·翰林府1期', 'yuelu'],
      ['君康家园', 'yuelu'],
      ['长沙火车站附近', 'furong'],
      ['长郡外国语附近', 'tianxin'],
      ['宁乡市某地', 'other'], // 无明确归属 → other（永不 issue）
    ] as const)('region「%s」→ %s', (region, expected) => {
      const block = `长沙家教网10034639号家教\n学员地址：${region}\n学员情况：初二、女\n辅导科目：数学\n教员要求：有耐心`;
      expect(draft(block).district).toBe(expected);
    });
  });

  describe('hourly_rate 时薪', () => {
    it.each([
      ['70元/小时', 70],
      ['100-110元/小时', 100], // 区间取下限
      ['60一小时一次两个小时', 60],
      ['50左右', 50],
      ['70/h', 70],
      ['100~150/h', 100],
      ['90每小时', 90],
      ['300元/次', null], // 按次 → null
      ['500元/天', null], // 按天 → null
      ['8000/月', null], // 按月 → null
      ['面议', null],
      ['80', null], // 无单位数字 → null（保守）
    ] as const)('薪水「%s」→ %s', (rate, expected) => {
      const block = `长沙家教网10034639号家教\n老师薪水：${rate}\n学员情况：初二、女\n辅导科目：数学\n学员地址：北部湾\n教员要求：有耐心`;
      expect(draft(block).hourly_rate).toBe(expected);
    });
  });

  describe('student_gender 性别', () => {
    it.each([
      ['初二、女', 'female'],
      ['五年级男。', 'male'],
      ['男女不限', 'unknown'],
      ['初三，两个人，一个姐姐一个弟弟', 'unknown'],
    ] as const)('学员情况「%s」→ %s', (info, expected) => {
      const block = `长沙家教网10034639号家教\n学员情况：${info}\n辅导科目：数学\n学员地址：北部湾\n教员要求：有耐心`;
      expect(draft(block).student_gender).toBe(expected);
    });
  });

  describe('mode 授课模式', () => {
    it('默认 offline', () => {
      const block = `长沙家教网10034639号家教\n学员情况：初二、女\n辅导科目：数学\n学员地址：北部湾\n教员要求：有耐心`;
      expect(draft(block).mode).toBe('offline');
    });
    it('含「线上/网课/直播」→ online', () => {
      for (const word of ['线上', '网课', '直播']) {
        const block = `长沙家教网10034639号家教\n学员情况：初二、女\n辅导科目：数学\n学员地址：北部湾\n时间安排：每周${word}辅导`;
        expect(draft(block).mode).toBe('online');
      }
    });
  });

  it('requirements 缺失 → issue（v0.1.1 必填集含 requirements）', () => {
    const block = `长沙家教网10034639号家教\n学员情况：初二、女\n辅导科目：数学\n学员地址：北部湾`;
    const d = draft(block);
    expect(d.requirements).toBeNull();
    expect(collectIssues(d)).toContainEqual({ field: 'requirements', reason: expect.any(String) });
  });
});

describe('segmentText 切分', () => {
  it('跳过空行/# 注释/纯 emoji 装饰行，按标题行切块', () => {
    const raw = [
      '8.26长沙家教网10034639号家教',
      '学员地址：北部湾',
      '𓈒𓂂𓏸🔮⸝🎁｡🎀॰',
      '# 群公告注释',
      '8.27长沙家教网10034675号家教',
      '学员地址：雨花区.才子嘉都',
      '',
    ].join('\n');
    const blocks = segmentText(raw);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('学员地址：北部湾');
    expect(blocks[0]).not.toContain('𓈒');
    expect(blocks[1]).toContain('才子嘉都');
  });

  it('裸编号标题（260827001）与「号4家教」标题均作为单子边界', () => {
    const blocks = segmentText('260827001\n学员地址：望城区长房星珑湾\n260827001号4家教\n学员地址：汉唐·翰林府1期');
    expect(blocks).toHaveLength(2);
  });

  it('跳过通告行（行首装饰后为 # 注释，如「📘 #开学单已秒 …」）', () => {
    const blocks = segmentText(
      '8.26长沙家教网10034646号家教\n学员地址：北部湾\n📘 #开学单已秒 长沙家教网10034646号家教\n8.27长沙家教网10034675号家教\n学员地址：雨花区.才子嘉都',
    );
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toContain('才子嘉都');
  });

  it('v0.1.3：首个标题前的聊天/广告噪声行不单独成块（丢弃）', () => {
    const blocks = segmentText(
      '小邹姐姐小助理在线，回复率慢一点，需要接单的同学一定要看好位置距离把简历准备好[让我看看]\n🌺 ⋆⁺⋆ 🏵⤾·˚ 🌸\n长沙家教网10034648号家教\n学员地址：开福区.湘江壹号玉树林',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('10034648');
  });
});

describe('dedupKey 去重键（§5.1 title 行 v0.1.1）', () => {
  it('装饰前缀/日期/emoji/#注释 折叠为同键', () => {
    expect(dedupKey('8.26长沙家教网10034635号家教')).toBe('长沙家教网10034635');
    expect(dedupKey('🎀🎀长沙家教网10034635号家教')).toBe('长沙家教网10034635');
    expect(dedupKey('🍄🍄长沙家教网10034617号家教')).toBe('长沙家教网10034617');
    expect(dedupKey('8.26长沙家教网10034617号家教')).toBe('长沙家教网10034617');
    expect(dedupKey('推长沙家教网10034676号家教6')).toBe('长沙家教网10034676');
    expect(dedupKey('📘 #开学单已秒 长沙家教网10034646号家教')).toBe('长沙家教网10034646');
    expect(dedupKey('8.26长沙家教网10034646号家教')).toBe('长沙家教网10034646');
    expect(dedupKey('长沙家教网10034003号家教6')).toBe('长沙家教网10034003'); // 号家教尾随数字剥离
    expect(dedupKey('🔢 #开学单已秒 长沙家教网10034003号家教')).toBe('长沙家教网10034003');
  });

  it('不同单不得合并（260827001号4家教 ≢ 260827001）', () => {
    expect(dedupKey('260827001号4家教')).not.toBe(dedupKey('260827001'));
  });
});

describe('PT-IMPORT-01 去重性质：同去重键至多 1 条 duplicate=false', () => {
  it('任意含重复标题的批次，首条保留、其余 duplicate=true', () => {
    const titles = [
      '8.26长沙家教网10034635号家教',
      '🎀🎀长沙家教网10034635号家教', // 同键变体
      '长沙家教网10034617号家教',
      '260827001号4家教',
      '260827001',
      '长沙家教网10034635号家教', // 第三次出现同键
      '推长沙家教网10034617号家教6',
      '🌟长沙家教ww260204（开学）',
    ];
    const raw = titles
      .map((t, i) => `${t}\n学员情况：初二、女\n辅导科目：数学\n学员地址：北部湾\n教员要求：有耐心 #${i}`)
      .join('\n');
    const rows = parseImport(raw);
    const byKey = new Map<string, number>();
    for (const row of rows) {
      const key = dedupKey(row.draft.title ?? '');
      byKey.set(key, (byKey.get(key) ?? 0) + (row.duplicate ? 0 : 1));
    }
    for (const [key, count] of byKey) {
      expect(count, `键 ${key} 的 duplicate=false 行数`).toBeLessThanOrEqual(1);
    }
    // 10034635 键 3 次出现 → 2 条 duplicate=true
    const k = dedupKey('长沙家教网10034635号家教');
    expect(rows.filter((r) => dedupKey(r.draft.title ?? '') === k && r.duplicate)).toHaveLength(2);
  });
});

describe('PT-IMPORT-02 标红性质：status=ok ⇔ collectIssues 为空', () => {
  it('对语料每行：ok ⇔ 必填 6 字段全部解析成功', () => {
    const rows = parseImport(FIXTURE);
    expect(rows.length).toBeGreaterThan(100); // 语料规模守卫
    for (const row of rows) {
      const issues = collectIssues(row.draft);
      const requiredOk = [row.draft.title, row.draft.subject, row.draft.grade_level, row.draft.region, row.draft.student_info, row.draft.requirements].every(Boolean);
      expect(row.status === 'ok').toBe(issues.length === 0);
      expect(row.status === 'ok').toBe(requiredOk);
    }
  });
});

describe('TC-IMPORT-008 你好.txt 可解析率（NFR ≥ 80%）', () => {
  it('单子级可解析率（ok 行占比）达标', () => {
    const rows = parseImport(FIXTURE);
    const ok = rows.filter((r) => r.status === 'ok').length;
    const rate = ok / rows.length;
    // eslint-disable-next-line no-console
    console.log(`[TC-IMPORT-008] 总块=${rows.length} ok=${ok} error=${rows.length - ok} 可解析率=${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });
});

describe('v0.1.3 解析增强（短标签/前导噪声/值级解析，用户对齐颗粒度 B）', () => {
  it('用户例 1：标题前的聊天行不单独成块，真单正常解析', () => {
    const raw = [
      '小邹姐姐小助理在线，回复率慢一点，需要接单的同学一定要看好位置距离把简历准备好[让我看看]',
      '🌺 ⋆⁺⋆ 🏵⤾·˚ 🌸',
      '长沙家教网10034648号家教',
      '学员地址：开福区.湘江壹号玉树林',
      '辅导科目：语数英全科+作业辅导 错题讲解 查漏补缺',
      '学员情况：五年级、男，一对一老师上门。',
      '教员要求：男，会运动 乒乓球羽毛球的老师优先',
      '老师薪水：50元/小时',
    ].join('\n');
    const rows = parseImport(raw);
    expect(rows).toHaveLength(1); // 噪声行被丢弃，不单独成块
    expect(rows[0].status).toBe('ok');
    expect(rows[0].draft.title).toContain('10034648');
    expect(rows[0].draft.district).toBe('kaifu');
    expect(rows[0].draft.hourly_rate).toBe(50);
  });

  it('用户例 2：短标签【地址】【科目】【时间】【要求】【报酬】全部恢复，按次计费 null', () => {
    const raw = [
      '长沙家教网10034699号家教托管',
      '【地址】长沙市开福区清水塘路尚清雅苑附近',
      '【科目】语数外家庭作业',
      '【时间】周一至周五下午4:20至7:50',
      '【要求】女性，有家教经验有耐心和责任心 。',
      '【报酬】每次薪资100元，包晚餐，每周结算工资。',
      '目前7个，正常没有超过10个，两个人带',
    ].join('\n');
    const rows = parseImport(raw);
    expect(rows).toHaveLength(1);
    const d = rows[0].draft;
    expect(d.region).toBe('长沙市开福区清水塘路尚清雅苑附近');
    expect(d.district).toBe('kaifu'); // 值内区县词兜底
    expect(d.subject).not.toBeNull();
    expect(d.subject).toContain('家庭作业');
    expect(d.requirements).toContain('女性');
    expect(d.schedule).toContain('周一至周五');
    expect(d.hourly_rate).toBeNull(); // 每次…元 → 按次 → null
    expect(d.rate).toContain('100元');
    // 该单原文未写年级 → grade 仍 null（设计：必填缺失标红交人工）
    expect(d.grade_level).toBeNull();
    expect(collectIssues(d)).toContainEqual({ field: 'grade_level', reason: expect.any(String) });
  });

  it('区县值内提取：长沙市开福区 → kaifu；长沙县 → changsha_county', () => {
    for (const [region, expected] of [
      ['长沙市开福区清水塘路', 'kaifu'],
      ['长沙市天心区某小区', 'tianxin'],
      ['长沙县星沙街道', 'changsha_county'],
    ] as const) {
      const block = `长沙家教网10034699号家教\n【地址】${region}\n【科目】数学\n【要求】有耐心`;
      expect(draft(block).district).toBe(expected);
    }
  });

  it('按次/天/周计费句式 → hourly_rate null（rate 原文保留）', () => {
    for (const rate of ['每次薪资100元', '每天80元', '每周500元']) {
      const block = `长沙家教网10034699号家教\n【报酬】${rate}\n【地址】开福区\n【科目】数学\n【要求】有耐心`;
      const d = draft(block);
      expect(d.hourly_rate, rate).toBeNull();
      expect(d.rate, rate).toContain('元');
    }
  });
});
