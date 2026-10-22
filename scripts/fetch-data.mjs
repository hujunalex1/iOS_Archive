#!/usr/bin/env node
/**
 * iOS 更新雷达 — 数据抓取
 *
 * 零依赖（Node 18+ 自带 fetch）。跑一次产出：
 *   data.json          页面读的数据
 *   feed.xml           Atom 订阅源（零后端提醒方案之一）
 *   ios-updates.ics    日历订阅源（零后端提醒方案之二）
 *
 * 信源与各自负责的字段（均为实测可用）：
 *   developer.apple.com RSS  → 版本号 + build + 发布日期（主信号，27KB）
 *   gdmf.apple.com/v2/pmv    → 权威：当前可安装版本 + 支持机型标识符（注意：带 Origin 头会 403，只能服务端抓）
 *   api.ipsw.me/v4/devices   → 机型标识符 → 市场名（一次拿全 284 台）
 *   cisa.gov KEV             → 「已被在野利用」权威清单
 *
 * 拿不到的字段（不要编）：
 *   - 单个版本修复了多少个 CVE：Apple 安全公告页是 JS 渲染的，没有公开 JSON 接口。
 *     NVD 的 cpeName 查询会因版本区间模糊匹配捞进远古 CVE（实测 iphone_os:27.0 返回 159 条，
 *     第一条是 CVE-2008-1586），不能用作「本版本修复数」。
 *   - 更新包体积：任何 feed 都不提供。
 */

import { readFile, writeFile } from 'node:fs/promises';

const SRC = {
  rss:     'https://developer.apple.com/news/releases/rss/releases.rss',
  gdmf:    'https://gdmf.apple.com/v2/pmv',
  devices: 'https://api.ipsw.me/v4/devices',
  kev:     'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
};

const UA = 'ios-update-radar/1.0 (data pipeline; contact: site owner)';
const KEV_WINDOW_DAYS = 90;
// 这些标识符前缀属于 iPhone；gdmf 的 iOS 键同时涵盖 iPad/iPod/AppleTV/HomePod
const IPHONE = 'iPhone';

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, { json = false, timeout = 30000, retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      // 不发送 Origin 头 —— gdmf 见到 Origin 直接 403
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      // 把 cause（UND_ERR_SOCKET / ECONNRESET 等）带进错误信息，
      // 否则日志里只有一句 fetch failed，根本看不出死在哪个源、为什么死
      const cause = e.cause ? ` [cause: ${e.cause.code || e.cause.message || e.cause}]` : '';
      lastErr = new Error(`${e.message} — ${url}${cause}`);
      if (attempt < retries) {
        console.error(`⚠️ 第 ${attempt}/${retries} 次抓取失败: ${lastErr.message}，${attempt * 2}s 后重试…`);
        await sleep(attempt * 2000);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const vkey = v => {
  const m = String(v).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [+m[1], +(m[2] || 0), +(m[3] || 0)] : [0, 0, 0];
};
const cmpVer = (a, b) => {
  const A = vkey(a), B = vkey(b);
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i];
  return 0;
};

/* ── 1. Apple 发布 RSS：版本号 + build + 日期 ───────────────────── */
function parseRss(xml) {
  const out = [];
  for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) || []) {
    const pick = re => (item.match(re) || [, ''])[1].trim();
    const title = pick(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const pub   = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    // 只要形如 "iOS 27.0 (24A437)" 的条目；跳过 "App Store Connect Update" 这类无版本号的
    const m = title.match(/^(iOS|iPadOS)\s+([\d.]+)\s*\(([^)]+)\)$/);
    if (!m) continue;
    const d = new Date(pub);
    out.push({
      platform: m[1],
      version: m[2],
      build: m[3],
      date: isNaN(d) ? null : d.toISOString().slice(0, 10),
    });
  }
  return out;
}

/* ── 2. gdmf：当前可安装分支 + 支持机型 ─────────────────────────── */

// 「iPhone 8 (Global)」与「iPhone 8 (GSM)」是同一款机型的两种基带版本，
// 对用户而言是同一台手机 —— 计数与展示时合并，但 devices 里保留原始标识符。
const collapseVariants = names => [...new Set(
  names.map(n => n.replace(/ \((?:Global|GSM)\)$/, ''))
)].sort((a, b) => a.localeCompare(b, 'en'));

function buildBranches(gdmf, nameOf, rssBy) {
  const pub = gdmf.PublicAssetSets?.iOS || [];

  // 同一版本可能有多个并存 build（不同签名分支）：取支持机型最多的那条作主记录，
  // 但所有 build 都留下 —— gdmf 报的 build 与 Apple 发布公告里的 build 可能不同。
  const byVer = new Map();
  for (const a of pub) {
    const iphones = (a.SupportedDevices || []).filter(x => x.startsWith(IPHONE));
    if (!iphones.length) continue;
    const cur = byVer.get(a.ProductVersion) || { builds: [], iphones: [], primary: null };
    cur.builds.push(a.Build);
    if (iphones.length > cur.iphones.length) {
      cur.iphones = iphones;
      cur.primary = a;
    }
    byVer.set(a.ProductVersion, cur);
  }

  return [...byVer.entries()]
    .sort((a, b) => cmpVer(b[0], a[0]))
    .map(([version, cur]) => {
      const builds = [...new Set(cur.builds)].sort();
      const rss = rssBy.get(version);
      const devices = cur.iphones
        .map(id => ({ id, name: nameOf.get(id) || id }))
        .sort((x, y) => x.name.localeCompare(y.name, 'en'));
      return {
        version,
        // 优先用 Apple 发布公告里的 build（用户能在「关于本机」里对照的那个），
        // 公告里没有该版本时退回 gdmf 主记录。
        build: rss && builds.includes(rss.build) ? rss.build : cur.primary.Build,
        builds,
        // 只信 RSS 的发布日期。gdmf 的 PostingDate 是「这条记录什么时候进的 feed」——
        // 所有分支都是同一天，照它显示会让 iOS 12.5.8 看着像昨天发布的。宁可为空。
        date: (rss && rss.date) || null,
        count: collapseVariants(devices.map(d => d.name)).length,
        devices,
        models: collapseVariants(devices.map(d => d.name)),
      };
    });
}

/* ── 3. 「升级不到最新版」：停在旧分支上的机型 ───────────────────── */
function deriveDropped(branches) {
  if (branches.length < 2) return [];
  const newestIds = new Set(branches[0].devices.map(d => d.id));
  const seen = new Set();
  const groups = new Map();   // version -> Set(合并后的机型名)
  for (const b of branches.slice(1)) {          // 已按版本降序，先命中的就是它能到的最高分支
    for (const d of b.devices) {
      if (newestIds.has(d.id) || seen.has(d.id)) continue;
      seen.add(d.id);
      if (!groups.has(b.version)) groups.set(b.version, new Set());
      groups.get(b.version).add(d.name.replace(/ \((?:Global|GSM)\)$/, ''));
    }
  }
  return [...groups.entries()].map(([version, set]) => ({
    version,
    models: [...set].sort((a, b) => a.localeCompare(b, 'en')),
  }));
}

/* ── 4. KEV：在野利用 ──────────────────────────────────────────── */
function buildKev(kev, today) {
  const cutoff = new Date(today.getTime() - KEV_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
  const apple = (kev.vulnerabilities || [])
    .filter(v => v.vendorProject === 'Apple')
    .map(v => ({
      cve: v.cveID,
      product: v.product,
      dateAdded: v.dateAdded,
      ransomware: v.knownRansomwareCampaignUse === 'Known',
    }))
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
  return {
    catalogVersion: kev.catalogVersion || null,
    catalogDate: kev.dateReleased ? kev.dateReleased.slice(0, 10) : null,
    windowDays: KEV_WINDOW_DAYS,
    totalApple: apple.length,
    recent: apple.filter(v => v.dateAdded >= cutoff),
    // 注意：KEV 只说明「Apple 有这些在野利用漏洞」，无法归属到某个 iOS 版本
    caveat: 'KEV 不标注修复版本，故不能归因到具体 iOS 版本',
  };
}

/* ── 输出：Atom + iCalendar ────────────────────────────────────── */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildFeed(releases, siteUrl, updated) {
  const items = releases.slice(0, 30).map(r => `
  <entry>
    <title>iOS ${esc(r.version)} (${esc(r.build)})</title>
    <id>urn:ios-radar:${esc(r.build)}</id>
    <updated>${r.date || updated}T00:00:00Z</updated>
    <link href="${siteUrl}"/>
    <summary>iOS ${esc(r.version)}（build ${esc(r.build)}）于 ${esc(r.date || '未知')} 发布。</summary>
  </entry>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>iOS 更新雷达</title>
  <link href="${siteUrl}"/>
  <link rel="self" href="${siteUrl}feed.xml"/>
  <updated>${updated}T00:00:00Z</updated>
  <id>urn:ios-radar:feed</id>
  <author><name>iOS 更新雷达</name></author>${items}
</feed>
`;
}

function buildIcs(releases, siteUrl, updated) {
  const stamp = d => String(d || updated).replace(/-/g, '');
  const next = d => {
    const t = new Date((d || updated) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString().slice(0, 10).replace(/-/g, '');
  };
  const events = releases.slice(0, 30).map(r => `BEGIN:VEVENT
UID:ios-radar-${r.build}@ios-update-radar
DTSTAMP:${stamp(r.date)}T000000Z
DTSTART;VALUE=DATE:${stamp(r.date)}
DTEND;VALUE=DATE:${next(r.date)}
SUMMARY:iOS ${r.version} 已发布（${r.build}）
DESCRIPTION:iOS ${r.version} build ${r.build}。详情：${siteUrl}
TRANSP:TRANSPARENT
END:VEVENT`).join('\n');
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//iOS 更新雷达//ZH//CN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:iOS 更新雷达
X-WR-TIMEZONE:Asia/Shanghai
${events}
END:VCALENDAR
`;
}

/* ── 版本号结构 → 分类（纯结构判断，不是 Apple 的官方分类）───────── */
const kindOf = v => {
  const parts = String(v).split('.').length;
  if (parts >= 3) return 'patch';                 // 26.6.2 —— 修订更新
  return String(v).endsWith('.0') ? 'major' : 'minor';  // 27.0 大版本 / 26.7 小版本
};

/* ── 把 data.json 内嵌进 index.html，让页面在 file:// 下双击也能用 ── */
async function embedSnapshot(file, data) {
  let html;
  try { html = await readFile(file, 'utf8'); } catch { return false; }
  // `<\/` 是合法 JSON 转义，同时避免版本说明里出现 `</script>` 时提前闭合脚本
  const json = JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
  const block = `/* SNAPSHOT:BEGIN —— 由 scripts/fetch-data.mjs 自动写入，请勿手改 */\n` +
                `const SNAPSHOT = ${json};\n/* SNAPSHOT:END */`;
  const re = /\/\* SNAPSHOT:BEGIN[\s\S]*?\/\* SNAPSHOT:END \*\//;
  if (!re.test(html)) return false;

  // 标题里的版本号也跟着走，免得站上写着 27 而数据已经是 27.1
  html = html
    .replace(re, block)
    .replace(/<title>[\s\S]*?<\/title>/,
      `<title>iOS 历代系统演进与功能百科 · 全版本图谱 (iPhone OS 1 ~ iOS \${data.latest.version})</title>`);

  await writeFile(file, html);
  return true;
}

/* ── main ─────────────────────────────────────────────────────── */
async function main() {
  const siteUrl = process.env.SITE_URL || 'https://example.com/';
  console.log('抓取中…');

  // 上一份 data.json 是降级保底：某个源抓不到时沿用它里面对应的数据，
  // 而不是像以前那样 Promise.all 里一个失败就整体退出、白白丢掉其余源的更新。
  // （背景：gdmf 在部分网络下连接会被直接断开，GitHub Actions 上曾因此长期全灭。）
  let prev = null;
  try { prev = JSON.parse(await readFile('data.json', 'utf8')); } catch { /* 首次运行没有旧数据 */ }
  const degraded = [];
  const attempt = async (name, fn) => {
    try { return await fn(); }
    catch (e) { console.error(`⚠️ 数据源 ${name} 抓取失败：${e.message}`); degraded.push(name); return null; }
  };

  const [rssXml, gdmf, devList, kevRaw] = await Promise.all([
    attempt('rss', () => get(SRC.rss)),
    attempt('gdmf', () => get(SRC.gdmf, { json: true })),
    attempt('devices', () => get(SRC.devices, { json: true })),
    attempt('kev', () => get(SRC.kev, { json: true })),
  ]);

  // 机型名映射：devices 抓不到时，从旧数据 branches 里把 id → name 捡回来
  const nameOf = new Map();
  if (devList) for (const d of devList) nameOf.set(d.identifier, d.name);
  else if (prev?.branches) for (const b of prev.branches) for (const d of b.devices || []) nameOf.set(d.id, d.name);

  let iosReleases;
  if (rssXml) {
    iosReleases = parseRss(rssXml)
      .filter(r => r.platform === 'iOS')
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || cmpVer(b.version, a.version))
      .map(r => ({ ...r, kind: kindOf(r.version), platform: undefined }));
  } else if (prev?.releases?.length) {
    console.error('↩️ RSS 不可用，沿用上一份 data.json 的 releases');
    iosReleases = prev.releases;
  } else {
    throw new Error('RSS 抓取失败且没有旧 data.json 可保底，无法继续');
  }

  const rssBy = new Map(iosReleases.map(r => [r.version, r]));

  let branches, dropped;
  const freshBranches = gdmf ? buildBranches(gdmf, nameOf, rssBy) : [];
  if (freshBranches.length) {
    branches = freshBranches;
    dropped = deriveDropped(branches);
  } else {
    if (!degraded.includes('gdmf')) degraded.push('gdmf');
    if (prev?.branches?.length) {
      console.error('↩️ gdmf 不可用（或未返回 iPhone 分支），沿用上一份 data.json 的 branches / dropped，本次只更新其余数据源');
      branches = prev.branches;
      dropped = prev.dropped || [];
    } else {
      throw new Error('gdmf 未返回任何 iPhone 可安装分支，且没有旧 data.json 可保底 —— 数据源结构可能已变，请检查');
    }
  }
  const today = new Date();
  const newest = branches[0];

  // KEV 抓不到时沿用旧的 kev 汇总（它是处理后的结构，不能再过一遍 buildKev）
  let kevOut;
  if (kevRaw) kevOut = buildKev(kevRaw, today);
  else if (prev?.kev) { console.error('↩️ KEV 不可用，沿用上一份 data.json 的 kev'); kevOut = prev.kev; }
  else kevOut = { catalogVersion: null, catalogDate: null, windowDays: KEV_WINDOW_DAYS, totalApple: 0, recent: [], caveat: 'KEV 本次抓取失败且无旧数据' };

  const data = {
    generatedAt: today.toISOString(),
    sources: SRC,
    ...(degraded.length ? {
      degraded: {
        sources: degraded,
        at: today.toISOString(),
        note: '以上数据源本次抓取失败，对应部分沿用上一份 data.json，其余部分为本次实时抓取',
      },
    } : {}),
    latest: {
      version: newest.version,
      build: newest.build,
      date: newest.date,
      deviceCount: newest.count,
      branchCount: branches.length,
    },
    branches,
    dropped,
    releases: iosReleases,
    kev: kevOut,
    unavailable: {
      fixes: 'Apple 安全公告页为 JS 渲染，无公开 JSON 接口，无法取得单版本 CVE 数',
      size: '更新包体积不在任何公开 feed 中',
    },
  };

  await writeFile('data.json', JSON.stringify(data, null, 2) + '\n');
  await writeFile('feed.xml', buildFeed(iosReleases, siteUrl, data.generatedAt.slice(0, 10)));
  await writeFile('ios-updates.ics', buildIcs(iosReleases, siteUrl, data.generatedAt.slice(0, 10)));

  const embedded = await embedSnapshot('index.html', data);

  console.log(`✓ 最新 iOS ${newest.version} (${newest.build}) ${newest.date} — 支持 ${newest.count} 款 iPhone`);
  console.log(`✓ ${branches.length} 条可安装分支 · ${dropped.reduce((n, g) => n + g.models.length, 0)} 款停在老分支 · RSS ${iosReleases.length} 条 · KEV 近 ${KEV_WINDOW_DAYS} 天 Apple ${data.kev.recent.length} 条`);
  console.log(`✓ 写出 data.json / feed.xml / ios-updates.ics${embedded ? ' · 已更新 index.html 内嵌快照' : ''}`);
  if (degraded.length) console.log(`⚠️ 本次为降级运行：${degraded.join(', ')} 未抓到，对应数据沿用旧版（旧版 generatedAt: ${prev?.generatedAt || '未知'}）`);
}

main().catch(e => { console.error('✗ 抓取失败:', e.message, e.cause ? `(cause: ${e.cause.code || e.cause.message})` : ''); process.exit(1); });
