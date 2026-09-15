import { readFile, writeFile } from 'node:fs/promises';

function formatBullet(text) {
  if (text.includes('：')) {
    const parts = text.split('：');
    return `<strong class="feat-lead">${parts[0]}：</strong><span class="feat-body">${parts.slice(1).join('：')}</span>`;
  }
  return `<span class="feat-body">${text}</span>`;
}

function renderVersionCardsHtml(versions, liveData) {
  return versions.map(v => {
    const isLatest = v.isLatest || v.num === 27;
    const highlights = v.highlights || [];
    const newFeats = v.newFeatures || [];
    const changes = v.changesAndImprovements || [];
    const secSystem = v.securityAndSystem || [];

    // Bento 重点创新卡片
    const bentoHtml = highlights.length ? `
      <div class="v-bento">
        ${highlights.map(h => `
          <div class="bento-card">
            <span class="bento-tag">${h.tag || '重点功能'}</span>
            <h4 class="bento-title">${h.title}</h4>
            <p class="bento-desc">${h.desc}</p>
          </div>
        `).join('')}
      </div>
    ` : '';

    // 淘汰机型标签
    const droppedBadge = v.droppedDevices && v.droppedDevices.length
      ? `<span class="device-pill device-pill--dropped">停止支持：${v.droppedDevices.join(', ')}</span>`
      : `<span class="device-pill">无淘汰机型</span>`;

    // 兼容机型规模 (优先使用实时官方固件库实测机型数)
    const supportedStr = isLatest && liveData?.latest?.deviceCount
      ? `官方实测覆盖 ${liveData.latest.deviceCount} 款 iPhone`
      : (v.supportedDevices && v.supportedDevices.length
        ? `覆盖 ${v.supportedDevices.length} 个系列机型`
        : '');

    const buildTag = isLatest && liveData?.latest?.build ? `构建号 ${liveData.latest.build} · ` : '';

    return `
    <section class="v-card ${isLatest ? 'v-card--latest' : ''}" id="v-${v.num}" data-v="${v.num}">
      
      <!-- 头部：版本名、发版日期、Slogan、首发硬件 -->
      <header class="v-header">
        <div class="v-meta-row">
          <span class="v-release-tag">
            ${v.codeName ? `代号 ${v.codeName.toUpperCase()} · ` : ''}${buildTag}${v.releaseDate || ''} 正式发布
          </span>
          ${isLatest ? `<span class="v-live-badge">最新正式版</span>` : ''}
        </div>

        <div class="v-title-row">
          <h2 class="v-version-title">${v.version}</h2>
          ${v.heroDevice ? `
            <div class="v-device-chip">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>
              </svg>
              <span>首发代表硬件：<strong>${v.heroDevice}</strong>${v.hardwareMilestone ? ` · ${v.hardwareMilestone}` : ''}</span>
            </div>
          ` : ''}
        </div>

        <p class="v-slogan">“${v.slogan || ''}”</p>
      </header>

      <!-- 里程碑创新 Bento Grid -->
      ${bentoHtml}

      <!-- 统一列表结构：新增功能 / 体验改动 / 底层安全 -->
      <div class="v-feature-sections">

        <!-- 1. 本代新增功能 -->
        ${newFeats.length ? `
          <div class="feat-section">
            <div class="feat-section-head">
              <h3 class="feat-section-title">本代新增功能</h3>
              <span class="feat-count-badge">${newFeats.length} 项</span>
            </div>
            <div class="unified-list">
              ${newFeats.map(f => `<div class="feat-row">${formatBullet(f)}</div>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 2. 重要体验改动与重塑 -->
        ${changes.length ? `
          <div class="feat-section">
            <div class="feat-section-head">
              <h3 class="feat-section-title">体验改动与设计重塑</h3>
              <span class="feat-count-badge">${changes.length} 项</span>
            </div>
            <div class="unified-list">
              ${changes.map(c => `<div class="feat-row">${formatBullet(c)}</div>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 3. 底层系统与隐私安全 -->
        ${secSystem.length ? `
          <div class="feat-section">
            <div class="feat-section-head">
              <h3 class="feat-section-title">底层系统架构与隐私安全</h3>
              <span class="feat-count-badge">${secSystem.length} 项</span>
            </div>
            <div class="unified-list">
              ${secSystem.map(s => `<div class="feat-row">${formatBullet(s)}</div>`).join('')}
            </div>
          </div>
        ` : ''}

      </div>

      <!-- 底部机型变迁 -->
      <footer class="v-footer">
        <div class="v-footer-left">
          <span class="footer-label">机型变迁：</span>
          ${droppedBadge}
        </div>
        <div class="v-footer-right">${supportedStr}</div>
      </footer>

    </section>
    `;
  }).join('\n');
}

function renderQuickJumpsHtml(versions) {
  return versions.map((v, i) =>
    `<a class="scrub-pill ${i === 0 ? 'active' : ''}" href="#v-${v.num}" data-target="v-${v.num}">${v.version}</a>`
  ).join('\n');
}

async function main() {
  const [dataJsonRaw, historyJsonRaw] = await Promise.all([
    readFile('data.json', 'utf8'),
    readFile('data/ios-history.json', 'utf8'),
  ]);

  const data = JSON.parse(dataJsonRaw);
  const history = JSON.parse(historyJsonRaw);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f5f5f7">
<title>Apple iOS 历代系统演进与功能全览 · 权威功能档案 (iPhone OS 1 至 iOS 27)</title>
<meta name="description" content="极简 Apple 风格 iOS 历代系统版本功能档案。详尽收录 2007 年初代 iPhone OS 1 到最新 iOS 27 共 20 个重大代际，每一代新增功能、体验改动与底层技术演进。">
<style>
/* Design tokens */
:root {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --hover: #fbfbfd;
  --text: #1d1d1f;
  --text-body: #424245;
  --text-2: #6e6e73;
  --text-3: #86868b;
  --text-4: #aeaeb2;
  --faint: #d2d2d7;
  --hairline: rgba(0, 0, 0, 0.07);

  --accent: #0071e3;
  --accent-link: #0066cc;

  --font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display',
          'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;

  --r-pill: 999px;
  --r-chip: 6px;
  --r-card: 18px;
  --r-panel: 22px;

  --sh-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.05);
  --sh-panel: 0 1px 3px rgba(0, 0, 0, 0.05), 0 14px 40px rgba(0, 0, 0, 0.05);
  --sh-lift: 0 12px 32px rgba(0, 0, 0, 0.09);

  --max-grid: 1080px;
  --pad-x: 22px;

  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
}

/* Base reset */
* { margin: 0; padding: 0; box-sizing: border-box; }
html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
  font-optical-sizing: auto;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.6;
  overflow-x: hidden;
}
a { color: var(--accent-link); text-decoration: none; }
a:hover { text-decoration: underline; }

.container {
  max-width: var(--max-grid);
  margin: 0 auto;
  padding-inline: var(--pad-x);
}

/* Sticky navigation */
.glass-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(245, 245, 247, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid transparent;
  transition: border-bottom-color 0.25s, box-shadow 0.25s;
}
.glass-nav.scrolled {
  border-bottom-color: var(--hairline);
  box-shadow: 0 1px 12px rgba(0, 0, 0, 0.04);
}

.nav-inner {
  max-width: var(--max-grid);
  margin: 0 auto;
  padding: 0 var(--pad-x);
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  font-weight: 650;
  font-size: 15px;
  letter-spacing: -0.01em;
  text-decoration: none;
  flex: none;
}
.nav-brand:hover { text-decoration: none; }
.nav-brand svg { color: var(--text); }

.nav-scrubber {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding: 4px 2px;
  mask-image: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent);
}
.nav-scrubber::-webkit-scrollbar { display: none; }

.scrub-pill {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
  padding: 5px 12px;
  border-radius: var(--r-pill);
  white-space: nowrap;
  text-decoration: none;
  transition: all 0.2s var(--ease-out-quart);
  flex: none;
}
.scrub-pill:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text);
  text-decoration: none;
}
.scrub-pill.active {
  background: var(--text);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

/* Page hero */
.hero {
  padding: clamp(40px, 6vw, 64px) 0 clamp(24px, 4vw, 40px);
  text-align: center;
}
.hero-title {
  font-size: clamp(32px, 5.8vw, 52px);
  font-weight: 750;
  letter-spacing: -0.03em;
  color: var(--text);
  line-height: 1.1;
  max-width: 820px;
  margin: 0 auto;
}

/* Version cards */
.versions-stack {
  display: flex;
  flex-direction: column;
  gap: clamp(34px, 6vw, 56px);
  margin-bottom: 84px;
}

.v-card {
  scroll-margin-top: 76px;
  background: var(--surface);
  border-radius: var(--r-panel);
  box-shadow: var(--sh-panel);
  border: 1px solid var(--hairline);
  padding: clamp(26px, 4.5vw, 44px);
  position: relative;
  transition: transform 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}
.v-card:hover {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06), 0 18px 48px rgba(0, 0, 0, 0.06);
}
.v-card--latest {
  border-color: rgba(0, 113, 227, 0.28);
}

/* Card header */
.v-header {
  border-bottom: 1px solid var(--hairline);
  padding-bottom: 20px;
}
.v-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.v-release-tag {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.v-live-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: rgba(0, 113, 227, 0.08);
  color: var(--accent-link);
  font-size: 11.5px;
  font-weight: 600;
}

.v-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.v-version-title {
  font-size: clamp(30px, 4.5vw, 42px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  line-height: 1.1;
}
.v-device-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
  background: rgba(0, 0, 0, 0.04);
  padding: 5px 12px;
  border-radius: var(--r-pill);
}
.v-device-chip svg { color: var(--text-3); }
.v-device-chip strong { color: var(--text); font-weight: 600; }

.v-slogan {
  margin-top: 12px;
  font-size: clamp(16px, 2.2vw, 19px);
  font-weight: 600;
  letter-spacing: -0.015em;
  color: var(--text);
  line-height: 1.45;
}

/* Bento grid */
.v-bento {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 22px;
}
.bento-card {
  background: var(--hover);
  border: 1px solid var(--hairline);
  border-radius: var(--r-card);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}
.bento-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-lift);
}
.bento-tag {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 7px;
  border-radius: var(--r-chip);
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-2);
  margin-bottom: 8px;
}
.bento-title {
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--text);
  line-height: 1.35;
}
.bento-desc {
  font-size: 13.5px;
  color: var(--text-2);
  margin-top: 6px;
  line-height: 1.55;
}

/* Feature sections */
.v-feature-sections {
  display: flex;
  flex-direction: column;
  gap: 22px;
  margin-top: 24px;
}

.feat-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 0 2px;
}
.feat-section-title {
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
}
.feat-count-badge {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* Unified list */
.unified-list {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--r-card);
  overflow: hidden;
}
.feat-row {
  padding: 13px 18px;
  font-size: 14px;
  color: var(--text-body);
  line-height: 1.6;
  transition: background 0.15s;
}
.feat-row + .feat-row {
  border-top: 1px solid var(--hairline);
}
.feat-row:hover {
  background: var(--hover);
}
.feat-lead {
  color: var(--text);
  font-weight: 600;
}
.feat-body {
  color: var(--text-body);
}

/* Card footer */
.v-footer {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--hairline);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 12.5px;
}
.v-footer-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.footer-label {
  color: var(--text-3);
  font-weight: 500;
}
.device-pill {
  font-size: 12px;
  font-weight: 550;
  padding: 3px 9px;
  border-radius: var(--r-pill);
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-2);
}
.device-pill--dropped {
  background: rgba(215, 0, 21, 0.06);
  color: #c4342b;
}
.v-footer-right {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* Site footer */
.site-footer {
  border-top: 1px solid var(--hairline);
  padding: 48px 0 80px;
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  line-height: 1.8;
}
.site-footer a { color: var(--text-2); font-weight: 550; }
.site-footer a:hover { color: var(--accent); }
.site-footer .sep { margin: 0 6px; color: var(--faint); }

/* Responsive & accessibility */
@media (max-width: 680px) {
  .nav-inner { padding: 0 16px; }
  .v-card { padding: 20px 16px; border-radius: var(--r-card); }
  .feat-row { padding: 11px 14px; font-size: 13.5px; }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
</head>
<body>

<!-- Navigation -->
<header class="glass-nav" id="siteNav">
  <div class="nav-inner">
    <a class="nav-brand" href="#top">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="display:inline-block; vertical-align:-0.125em; flex:none;">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.82M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      <span>iOS 版本档案</span>
    </a>

    <div class="nav-scrubber" id="navScrubber">
      ${renderQuickJumpsHtml(history.versions)}
    </div>
  </div>
</header>

<main id="top" class="container">

  <!-- Hero -->
  <section class="hero">
    <h1 class="hero-title">Apple iOS 历代系统版本功能全览</h1>
  </section>

  <!-- Versions stack -->
  <div class="versions-stack" id="versionsContainer">
    ${renderVersionCardsHtml(history.versions, data)}
  </div>

</main>

<footer class="container site-footer">
  <p>严格基于 Apple 历年 WWDC 开发者大会与技术支持更新文档整理 · 100% 真实客观记录</p>
  <p style="margin-top:6px;">
    <a href="data/ios-history.json" target="_blank">查看原始 JSON 数据源</a>
    <span class="sep">·</span>
    <a href="feed.xml" target="_blank">Atom 订阅</a>
    <span class="sep">·</span>
    <a href="ios-updates.ics" target="_blank">日历订阅</a>
    <span class="sep">·</span>
    <a href="#top">回到顶部</a>
  </p>
</footer>

<script>
/* SNAPSHOT:BEGIN —— 由 scripts/fetch-data.mjs 自动写入，请勿手改 */
const SNAPSHOT = ${JSON.stringify(data, null, 2).replace(/<\//g, '<\\/')};
/* SNAPSHOT:END */

/* HISTORY_SNAPSHOT:BEGIN */
const HISTORY_SNAPSHOT = ${JSON.stringify(history, null, 2).replace(/<\//g, '<\\/')};
/* HISTORY_SNAPSHOT:END */

// 滚动边沿与导航高亮联动
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('siteNav');
  const cards = document.querySelectorAll('.v-card');
  const pills = document.querySelectorAll('.scrub-pill');
  const scrubber = document.getElementById('navScrubber');

  // 滚动边沿侦测
  window.addEventListener('scroll', () => {
    if (nav) {
      nav.classList.toggle('scrolled', window.scrollY > 8);
    }
  }, { passive: true });

  // 视口交叉监听
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        pills.forEach(pill => {
          if (pill.getAttribute('data-target') === id) {
            pill.classList.add('active');
            if (scrubber) {
              const pillRect = pill.getBoundingClientRect();
              const boxRect = scrubber.getBoundingClientRect();
              if (pillRect.left < boxRect.left || pillRect.right > boxRect.right) {
                pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }
            }
          } else {
            pill.classList.remove('active');
          }
        });
      }
    });
  }, {
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  });

  cards.forEach(c => observer.observe(c));
});
</script>
</body>
</html>
`;

  await writeFile('index.html', html, 'utf8');
  console.log('✓ 成功根据 kill-ai-slop 规范构建清新干净的 index.html');
}

main().catch(err => {
  console.error('构建失败:', err);
  process.exit(1);
});
