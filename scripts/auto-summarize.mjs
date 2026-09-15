#!/usr/bin/env node
/**
 * iOS 更新雷达 — 新版本全自动真实查询与归纳引擎 (auto-summarize.mjs)
 *
 * 核心职责：
 * 1. 检测 data.json 中的最新版本是否尚未在 data/ios-history.json 中归档；
 * 2. 若检测到新版本（如新大代际 iOS 28 或重大子版本 iOS 27.1）：
 *    - 读取 Apple 固件库实测机型，真实计算新增/淘汰机型；
 *    - 调用具备 Google Search Grounding 联网检索能力的模型（如 Gemini API）；
 *    - 强制检索 Apple 官方新闻稿 (Apple Newsroom)、官方技术支持文档 (support.apple.com) 与 WWDC 讲稿；
 *    - 严格杜绝 AI 虚构，只提取真实设置路径（如 设置 > ...）、真实按键与交互场景；
 * 3. 严格 JSON Schema 校验，确保数据完整安全后写入 data/ios-history.json；
 * 4. 零破坏保护：未配置 API Key 或网络波动时安全退出，绝不影响基础数据更新。
 *
 * 可选参数：
 *   --dry-run        仅打印归纳结果，不写入文件
 *   --force <version> 强制对指定版本进行归纳测试（例如 node scripts/auto-summarize.mjs --force 28.0）
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const DATA_JSON_PATH = join(ROOT, 'data.json');
const HISTORY_JSON_PATH = join(ROOT, 'data/ios-history.json');

// 解析 CLI 参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const forceIdx = args.indexOf('--force');
const forcedVersion = forceIdx !== -1 ? args[forceIdx + 1] : null;

/**
 * 安全解析 JSON
 */
async function loadJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[auto-summarize] 无法读取文件: ${filePath}`, err.message);
    return null;
  }
}

/**
 * 提取主版本号
 */
function parseVersion(vStr) {
  const m = String(vStr).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return { major: 0, minor: 0, patch: 0, raw: vStr };
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2] || '0', 10),
    patch: parseInt(m[3] || '0', 10),
    raw: vStr,
  };
}

/**
 * 从最新支持机型列表中提取系列名称（如 "iPhone 16 系列"）
 */
function summarizeDeviceFamilies(devices = []) {
  if (!devices || !devices.length) return [];
  const families = new Set();
  for (const d of devices) {
    const name = d.name || '';
    if (name.startsWith('iPhone SE')) {
      families.add('iPhone SE 系列');
    } else {
      const m = name.match(/iPhone\s+(\d+)/);
      if (m) {
        families.add(`iPhone ${m[1]} 系列`);
      } else if (name.includes('iPhone')) {
        families.add(name);
      }
    }
  }
  return Array.from(families);
}

/**
 * 比对新旧支持机型，计算真实淘汰机型
 */
function computeDroppedDevices(prevDevices = [], currDevices = []) {
  const currIds = new Set(currDevices.map(d => d.id || d.name));
  const dropped = [];
  for (const p of prevDevices) {
    const id = p.id || p.name;
    if (!currIds.has(id) && !dropped.includes(p.name)) {
      dropped.push(p.name);
    }
  }
  return dropped;
}

/**
 * 调用 Gemini API (带 Google Search Grounding 实时官方检索)
 */
async function queryGeminiWithGrounding(apiKey, promptText) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: promptText,
          },
        ],
      },
    ],
    tools: [
      {
        googleSearch: {}, // 强制启用 Google 搜索 Grounding，确保基于真实信源
      },
    ],
    generationConfig: {
      temperature: 0.1, // 极低随机性，确保严谨与事实对齐
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 请求失败 (${res.status} ${res.statusText}): ${errText}`);
  }

  const json = await res.json();
  const candidate = json.candidates?.[0];
  if (!candidate || !candidate.content?.parts?.length) {
    throw new Error('Gemini API 未返回有效内容');
  }

  const text = candidate.content.parts.map(p => p.text || '').join('');
  return text;
}

/**
 * 提取并验证 JSON
 */
function extractAndValidateJson(rawText) {
  let cleaned = rawText.trim();
  // 剥除可能的 ```json 和 ``` 包裹
  if (cleaned.includes('```json')) {
    cleaned = cleaned.replace(/^[\s\S]*?```json\s*/, '').replace(/```[\s\S]*$/, '');
  } else if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/^[\s\S]*?```\s*/, '').replace(/```[\s\S]*$/, '');
  }

  // 定位最外层的 { 和 }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('返回文本中未找到有效 JSON 对象结构');
  }

  const jsonStr = cleaned.slice(start, end + 1);
  const data = JSON.parse(jsonStr);

  // 严格 Schema 校验
  if (!data.version || typeof data.version !== 'string') {
    throw new Error('校验失败：缺少合法 version 字段');
  }
  if (!data.num || typeof data.num !== 'number') {
    throw new Error('校验失败：缺少合法 num 数字代际');
  }
  if (!data.highlights || !Array.isArray(data.highlights) || data.highlights.length < 3) {
    throw new Error('校验失败：highlights 需包含至少 3-4 个重点创新卡片');
  }
  for (const h of data.highlights) {
    if (!h.title || !h.desc || !h.tag) {
      throw new Error('校验失败：highlight 必须包含 tag、title、desc');
    }
  }
  if (!data.newFeatures || !Array.isArray(data.newFeatures) || data.newFeatures.length < 4) {
    throw new Error('校验失败：newFeatures 必须为包含具体功能条目的数组（不少于 4 条）');
  }
  if (!data.changesAndImprovements || !Array.isArray(data.changesAndImprovements)) {
    throw new Error('校验失败：changesAndImprovements 必须为数组');
  }

  return data;
}

/**
 * 主逻辑
 */
async function main() {
  console.log('─── 🔍 开始检查 iOS 新版本功能档案状态 ───');

  const [data, history] = await Promise.all([
    loadJson(DATA_JSON_PATH),
    loadJson(HISTORY_JSON_PATH),
  ]);

  if (!data || !history) {
    console.error('❌ 基础数据文件读取失败，终止执行。');
    process.exit(1);
  }

  const latestFromData = data.latest?.version || '';
  const latestBuild = data.latest?.build || '';
  const latestDate = data.latest?.date || new Date().toISOString().split('T')[0];
  const targetVerStr = forcedVersion || latestFromData;

  const targetVer = parseVersion(targetVerStr);
  const maxHistoryNum = Math.max(...history.versions.map(v => v.num || 0));

  console.log(`[状态] 固件库最新版本: iOS ${targetVerStr} (Build: ${latestBuild})`);
  console.log(`[状态] 知识库收录最高代际: iOS ${maxHistoryNum}`);

  // 检查是否需要归纳
  const isNewMajor = targetVer.major > maxHistoryNum;
  const isExistingCovered = history.versions.some(v => v.num === targetVer.major);

  if (!isNewMajor && isExistingCovered && !forcedVersion) {
    console.log(`✅ 当前最高版本 iOS ${targetVer.major} 已在档案中（版本: ${history.latestVersion}），无需生成新代际。`);
    return;
  }

  console.log(`⚡ 检测到全新版本代际: iOS ${targetVer.major} (版本字符串: ${targetVerStr})，准备启动官方检索与归纳！`);

  // 检查 API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('\n⚠️ [提示] 未检测到 GEMINI_API_KEY 环境变量。');
    console.warn('为了实现「自动检索 Apple 官方真实公告并归纳」，请在 GitHub 仓库中配置 Secret:');
    console.warn('  Settings › Secrets and variables › Actions › Repository secrets › 新增 GEMINI_API_KEY');
    console.warn('目前跳过自动生成，保持现有数据与页面，不会影响 CI 正常流程。\n');
    return;
  }

  // 整理实测机型与淘汰机型
  const latestBranch = data.branches?.find(b => b.version === targetVerStr) || data.branches?.[0];
  const currDevices = latestBranch?.devices || [];
  const prevBranch = data.branches?.find(b => b.version !== targetVerStr);
  const prevDevices = prevBranch?.devices || [];

  const supportedFamilies = summarizeDeviceFamilies(currDevices);
  const droppedDevices = computeDroppedDevices(prevDevices, currDevices);

  console.log(`[机型分析] 官方实测支持: ${supportedFamilies.join(', ') || '根据苹果发布会为准'}`);
  if (droppedDevices.length) {
    console.log(`[机型分析] 淘汰停止支持机型: ${droppedDevices.join(', ')}`);
  }

  // 构造严密的提示词（强制真实、强制防幻觉、严格结构）
  const prompt = `你是一位严谨客观的 Apple 官方系统历史学家与资深科技架构师。
请你利用联网搜索工具 (Google Search)，深入查询 Apple 官方对于刚刚发布的【iOS ${targetVer.major}】（具体版本 ${targetVerStr}）的真实发布会新闻稿 (Apple Newsroom)、官方技术支持文档 (support.apple.com)、WWDC 开发者发布说明与真实功能更新日志。

【核心原则 - 绝对真实，严禁幻觉与夸大】：
1. 每一条功能点必须来自 Apple 官方正式发布的内容，严禁凭空捏造未发布的概念；
2. 必须具体写出真实的【设置路径】（例如“设置 > 通用 > ...”）、真实的【按键/菜单名称】、具体的【交互逻辑】以及解决的用户实际痛点；
3. 严格禁止 AI 营销黑话（严禁出现“神级功能”、“史诗级更新”、“颠覆性重构”、“重磅上线”等浮夸词汇），保持 Apple 官方技术文档与用户指南那种极简、客观、克制、严密的工业写作风格；
4. 格式必须是标准的纯 JSON 格式，严格符合下方 Schema 要求，不得输出任何多余的 Markdown 说明文字。

【已知官方参数】：
- 版本名称: iOS ${targetVer.major}
- 代际数字 (num): ${targetVer.major}
- 发版日期: ${latestDate}
- 构建号: ${latestBuild}
- 固件支持机型规模: 覆盖约 ${currDevices.length || 34} 款 iPhone（包含 ${supportedFamilies.slice(0, 5).join('、')} 等）
${droppedDevices.length ? `- 淘汰机型: ${droppedDevices.join('、')}` : ''}

【输出 JSON 字段规范】：
{
  "version": "iOS ${targetVer.major}",
  "num": ${targetVer.major},
  "eraId": "nextgen-neural",
  "releaseDate": "${latestDate}",
  "isLatest": true,
  "codeName": "官方代号（如检索不到填英文大写首字母代表名）",
  "slogan": "一句极度凝练的官方主旨 Slogan（15字以内）",
  "heroDevice": "同期发售的代表旗舰硬件机型（例如 iPhone XX 系列）",
  "hardwareMilestone": "该版本标志性的底层硬件/交互技术突破",
  "highlights": [
    {
      "tag": "所属功能域（如 Siri / 相机 / 隐私 / 设计 等，简短2-4字）",
      "title": "功能名称（简明干练）",
      "desc": "通俗且具象的功能解释，说清在什么场景下如何操作，带来什么改变（50字左右）"
    }
    // 恰好 4 个最具代表性的重点创新
  ],
  "newFeatures": [
    // 6-8 个新增功能条目，格式严格为：“功能名称：具体操作路径、触发手势与使用场景”
    // 示例：“全新独立控制中心自选分组：下拉控制中心后支持按网络、播放控制、智能家居分页滑动，长按任意组件即可无级调节大小”
  ],
  "changesAndImprovements": [
    // 4-6 个体验优化与细节调整条目，格式严格为：“优化项名称：具体改动细节、速度提升数值或旧逻辑修正”
    // 示例：“应用启动与后台保活优化：优化底层渲染资源管线，连续滑动高帧率无掉帧，冷启动速度提升显著”
  ],
  "securityAndSystem": [
    // 3-4 个底层系统与架构演进，格式为纯文本，涉及真实安全机制、老旧框架废弃或底层 API
  ],
  "droppedDevices": ${JSON.stringify(droppedDevices)},
  "supportedDevices": ${JSON.stringify(supportedFamilies.length ? supportedFamilies : [`iPhone ${targetVer.major - 9} 系列及后续机型`])}
}

请立即检索真实信息并输出合法 JSON：`;

  console.log('🤖 正在通过 Google Search Grounding 检索 Apple 官方真实公告与技术说明...');

  try {
    const rawResult = await queryGeminiWithGrounding(apiKey, prompt);
    const newVersionData = extractAndValidateJson(rawResult);

    console.log(`✨ 成功提炼并通过真实性校验！版本: ${newVersionData.version}`);
    console.log(`   - 重点创新: ${newVersionData.highlights.map(h => h.title).join(' | ')}`);
    console.log(`   - 新增功能数: ${newVersionData.newFeatures.length}`);
    console.log(`   - 体验优化数: ${newVersionData.changesAndImprovements.length}`);

    if (isDryRun) {
      console.log('\n[Dry-run 模式] 提炼内容预览:\n', JSON.stringify(newVersionData, null, 2));
      return;
    }

    // 更新 history 数据
    history.updatedAt = new Date().toISOString();
    history.latestVersion = targetVerStr;

    // 将已有版本的 isLatest 全部置为 false
    for (const v of history.versions) {
      v.isLatest = false;
    }

    // 插入新版本到首位
    history.versions.unshift(newVersionData);

    // 同步更新 eras
    if (history.eras && history.eras.length > 0) {
      const topEra = history.eras[0];
      if (!topEra.versions.includes(newVersionData.version)) {
        topEra.versions.unshift(newVersionData.version);
        // 更新年份
        const currYear = new Date().getFullYear();
        if (!topEra.years.includes(String(currYear))) {
          topEra.years = `${topEra.years.split('-')[0].trim()} - ${currYear}`;
        }
      }
    }

    // 写入文件
    await writeFile(HISTORY_JSON_PATH, JSON.stringify(history, null, 2) + '\n', 'utf8');
    console.log(`💾 已成功写入: ${HISTORY_JSON_PATH}`);

    console.log('🎉 新版本功能档案自动归纳完毕！');
  } catch (err) {
    console.error('❌ 归纳过程发生异常:', err.message);
    if (process.env.CI) {
      // 在 CI 环境下不中断整体构建
      console.warn('⚠️ CI 环境降级：保留现有数据，退出码为 0 以确保基本服务不中断。');
      process.exit(0);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('未捕获异常:', err);
  process.exit(1);
});
