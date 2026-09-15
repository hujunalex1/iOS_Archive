# Apple iOS 历代系统演进与功能全览 (iPhone OS 1 ~ iOS 27)

一个专注于介绍 Apple iOS 操作系统历代重大版本更新功能、体验改动与底层技术演进的极简 Apple 风格档案网站：
- **完整跨代图谱**：从 2007 年初代 iPhone OS 1 一路收录至最新的 iOS 27，共 20 个重大代际；
- **权威客观依据**：所有功能特性均源自 Apple 历年 WWDC 发布会与官方技术支持更新文档；
- **明确分类架构**：清晰区分「本代新增功能」、「体验改动与设计重塑」和「底层系统架构与隐私安全」；
- **标志性里程碑**：每代配备 Apple Bento Grid 重点创新卡片、官方宣传语 (Slogan)、首发代表硬件及机型淘汰支持状态；
- **极致 Apple 风格**：遵循 Apple 工业设计哲学（浮岛毛玻璃交互导航、双边框卡片架构、SF Pro 字体体系、漫反射环境阴影）；
- **零依赖与秒开**：纯静态输出，支持直接双击运行或托管至 GitHub Pages / Cloudflare Pages。

```
index.html                  ← 站点本体，单文件，极致 Apple 工业设计风格
data/ios-history.json       ← 历代版本功能完整知识库 (iPhone OS 1 ~ iOS 27)
scripts/build-page.mjs      ← 页面编译与静态 HTML 生成脚本
scripts/fetch-data.mjs      ← 官方实时抓取脚本，零依赖（Node 18+ 自带 fetch）
scripts/auto-summarize.mjs  ← 新版本全自动真实查询与归纳引擎（带联网 Grounding 检索）
data.json                   ← 官方实时抓取结果
feed.xml                    ← Atom 订阅源
ios-updates.ics             ← 日历订阅源
```

## 数据从哪来

| 信源 | 提供什么 |
|---|---|
| `developer.apple.com/news/releases/rss/releases.rss` | 版本号、构建号、发布日期（主信号） |
| `gdmf.apple.com/v2/pmv` | 权威：当前可安装的**所有分支**，以及每条分支支持的机型标识符 |
| `api.ipsw.me/v4/devices` | 机型标识符 → 市场名（`iPhone15,2` → `iPhone 15 Pro`） |
| `cisa.gov` KEV 目录 | 「已被在野利用」的权威清单 |

几处容易踩的坑，脚本里都有注释：

- **`gdmf` 见到 `Origin` 请求头会返回 403**，浏览器直接抓不了。所以必须有服务端定时抓取，
  页面自己拿不到数据——这是这个项目需要 cron 的唯一原因。
- **`gdmf` 的 `PostingDate` 不是发布日期**，是「这条记录什么时候进的 feed」。所有分支都是同一天，
  照它显示会让 iOS 12.5.8 看着像昨天发布的。脚本只信 RSS 的日期，没有就留空。
- **同一个版本可能有多个并存 build**（`24A437` / `24A6437` / `24A9437`）。发布公告里的那个
  才是用户在「关于本机」里能对照的，优先用它；`branches[].builds` 保留全部。
- **`iPhone 8 (Global)` 和 `iPhone 8 (GSM)` 是同一台手机**的两种基带版本。计数和展示时合并，
  `devices` 里保留原始标识符。

### 故意不显示的字段

- **单个版本修复了多少个 CVE** —— Apple 安全公告页是 JS 渲染的（FujiStitch），没有公开 JSON 接口。
  NVD 的 `cpeName` 查询看着能用，但版本区间是模糊匹配：查 `iphone_os:27.0` 返回 159 条，
  第一条是 `CVE-2008-1586`。**不能拿它当「本版本修复数」。**
- **更新包体积** —— 任何 feed 都不提供。
- **在野利用漏洞归属到某个 iOS 版本** —— CISA KEV 不标注修复版本号，只能说明 Apple 全平台的情况。

页面上这三处都写明了原因，没用估算数字填。

## 本地跑与构建

```bash
# 重新编译构建页面（如修改了样式或知识库）
node scripts/build-page.mjs

# 或抓取最新发布数据并同步
node scripts/fetch-data.mjs

# 启动本地预览
python3 -m http.server 8000      # 然后打开 http://localhost:8000
```

直接双击 `index.html` 也能用：`file://` 下 `fetch('data.json')` 会被 CORS 拦掉，页面会自动退回
文件里内嵌的那份快照。两条路径是同一份真实数据。

> **如果报 `SELF_SIGNED_CERT_IN_CHAIN`（只影响 `gdmf.apple.com`）**：说明你的网络上有 TLS 中间人代理，
> curl 走 macOS 钥匙串所以没事，Node 用自带的 Mozilla CA 列表所以不认。本地临时绕过：
>
> ```bash
> { security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain
>   security find-certificate -a -p /Library/Keychains/System.keychain
>   security find-certificate -a -p ~/Library/Keychains/login.keychain-db; } > /tmp/ca-bundle.pem
> NODE_EXTRA_CA_CERTS=/tmp/ca-bundle.pem node scripts/fetch-data.mjs
> ```
>
> 这**只是本机网络的权宜之计**，不要写进 CI，也不要提交——那等于关掉证书校验。

## 部署

站点是纯静态的，扔到任意静态托管即可（GitHub Pages / Netlify / Cloudflare Pages）。

`.github/workflows/update.yml` 每 30 分钟跑一次抓取，数据有变化才提交，一次提交里包含
`data.json`、`feed.xml`、`ios-updates.ics` 和更新了内嵌快照的 `index.html`。

两点注意：

- 需要用 **Settings › Variables** 设一个 `SITE_URL`，否则 `feed.xml` / `.ics` 里的链接是占位域名。
- GitHub 会在仓库**连续 60 天没有提交**后自动停掉定时任务。正常情况下 Apple 发版的节奏不会让它静默，
  但如果真停了，去 Actions 页面手动跑一次就能恢复。

想改抓取频率就改 `cron`；想让提醒不需要任何后端，把 `feed.xml` 或 `ios-updates.ics` 的地址
丢给任意 RSS 阅读器 / 日历就行——这也是页脚那两个订阅链接的用意。

## 新版本全自动真实检索与归纳 (Auto Summarize)

当 Apple 正式推送新版本代际（如 iOS 27.1 或未来代际 iOS 28）时，流水线支持**全自动联网检索官方发版文档并归纳新功能**：

1. **真实性与防幻觉机制**：
   - 优先通过 Apple 官方固件库 (`gdmf.apple.com`) 交叉计算支持设备与淘汰设备；
   - 启用 Google Search Grounding 实时联网检索 Apple 官方新闻稿 (Apple Newsroom)、WWDC 发布会讲稿与官方技术支持文档 (`support.apple.com`)；
   - 提示词强制要求具体设置路径（如 `设置 > ...`）、具体按键名称与真实使用痛点，坚决剔除任何营销夸大词；
   - 严格进行 JSON Schema 格式校验后才写入 `data/ios-history.json` 并重新生成静态页面。

2. **配置开启全自动归纳**：
   在 GitHub 仓库中配置 Secret：
   - 进入 GitHub 仓库页面：`Settings` › `Secrets and variables` › `Actions` › `New repository secret`
   - Name 填：`GEMINI_API_KEY`
   - Value 填：你的 Google Gemini API Key（支持免费获取）

> 💡 **容错与免配置保护**：若未配置 `GEMINI_API_KEY` 或检索接口临时超时，工作流会自动跳过功能说明生成，照常更新基础固件版本号与页面，绝对不会导致 CI 报错中断。

