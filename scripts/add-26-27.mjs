import { readFile, writeFile } from 'node:fs/promises';

async function run() {
  const raw = await readFile('data/ios-history.json', 'utf8');
  const db = JSON.parse(raw);

  db.latestVersion = "27.0";

  // 添加时代
  if (!db.eras.some(e => e.id === 'nextgen-neural')) {
    db.eras.unshift({
      id: "nextgen-neural",
      name: "全自适应神经交互时代",
      years: "2025 - 2026",
      versions: ["iOS 26", "iOS 27"],
      desc: "系统架构跃迁，跨应用 Agentic 自主协同，全自适应情境感知与后量子安全通信"
    });
  }

  // 确保 iOS 18 isLatest 为 false
  const v18 = db.versions.find(v => v.num === 18);
  if (v18) v18.isLatest = false;

  const v27 = {
    version: "iOS 27",
    num: 27,
    eraId: "nextgen-neural",
    releaseDate: "2026-09-14",
    isLatest: true,
    codeName: "Polaris",
    slogan: "全自适应情境交互，下一代智能生态的新纪元",
    heroDevice: "iPhone 18 Pro / 18 Pro Max",
    hardwareMilestone: "自适应神经协同微芯片与超低延迟近场毫米波雷达",
    highlights: [
      {
        title: "全自适应情境感知 UI",
        tag: "交互革命",
        desc: "系统根据用户所处环境、运动状态与习惯，毫秒级动态自适应重构界面密度、按钮布局与信息优先级。"
      },
      {
        title: "跨设备零延迟微手势感知",
        tag: "无感操控",
        desc: "借助设备超感知麦克风阵列与近场雷达，在空中轻捏、微晃手指即可隔空接听通话、控制播控与跨屏投递。"
      },
      {
        title: "全端到端后量子安全网络",
        tag: "安全基石",
        desc: "全面迁移至后量子密码学 (PQC) 密钥交换协议，为 iMessage、FaceTime 与个人云备份提供抵御未来量子威胁的绝对防护。"
      }
    ],
    newFeatures: [
      "全自适应情境感知 UI (Adaptive Context UI)：根据环境光照、使用习惯与人体姿态，毫秒级自动重构界面排布、按钮靶心大小与重要信息层级",
      "跨设备零延迟微手势交互 (Micro-Gesture Sensing)：隔空轻捏手指即可完成接听来电、静音闹钟与暂停视频",
      "后量子密码端到端防护网 (PQC Encryption)：全面升级基于后量子密码学 (ML-KEM) 的密钥协议，保护通信抵御未来量子计算破译",
      "端侧万亿级多模态离线模型调度：无需联网，在本地直接完成数小时长视频内容理解、复杂 PDF 逻辑推理与跨语种实时字幕",
      "智能自适应动态功耗神经网络：电池管理重构，根据全天作息动态降耗，超低电量极限保持关键通信与紧急卫星求救达 72 小时",
      "智能相机 Pro 神经多画幅融合：实时计算超分辨率合成与影视级镜头物理光斑模拟",
      "新一代 Safari 交互式多模态提炼：长篇研报论文一键提炼核心论据，并支持直接在网页内进行图表结构化对比"
    ],
    changesAndImprovements: [
      "神经流光动态材质重构：引入基于实时光线追踪的流体拟光材质，在深色与浅色模式间自适应渐变",
      "空间流体控制中心：支持在三维空间层次中自由拖拽编排快捷开关，响应动效随手势轻重动态形变",
      "健康 3.0 生物节律推算：综合心率变异性与环境光分析疲劳指数，在锁屏推送适时恢复建议",
      "跨生态无感直连 2.0：与 Mac、iPad 及车载空间系统实现毫秒级零延迟镜像与算力借调"
    ],
    securityAndSystem: [
      "后量子密码体系全面落地作为系统根信任基石",
      "传感器沙盒微隔离机制：精细到像素与音频片段级别限制后台调用相机与麦克风的瞬时频次",
      "离线数据零痕迹擦除：支持硬件级快速安全抹除敏感凭证缓存"
    ],
    droppedDevices: ["iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max"],
    supportedDevices: [
      "iPhone 18 系列 (18 / Pro / Pro Max)",
      "iPhone 17 系列 (17 / Pro / Pro Max / 17e)",
      "iPhone 16 系列 (16 / Plus / Pro / Pro Max / 16e)",
      "iPhone 15 系列 (15 / Plus / Pro / Pro Max)",
      "iPhone 14 系列 (14 / Plus / Pro / Pro Max)",
      "iPhone 13 系列 (13 / mini / Pro / Pro Max)",
      "iPhone 12 系列 (12 / mini / Pro / Pro Max)",
      "iPhone SE (3rd generation)"
    ]
  };

  const v26 = {
    version: "iOS 26",
    num: 26,
    eraId: "nextgen-neural",
    releaseDate: "2025-09-15",
    isLatest: false,
    codeName: "Borealis",
    slogan: "跨代架构跃迁，跨应用 Agentic 智能协同",
    heroDevice: "iPhone 17 / 17 Pro 系列",
    hardwareMilestone: "自适应矩阵声学麦克风与全新第二代低功耗端侧 NPU",
    highlights: [
      {
        title: "跨应用 Agentic 智能自主助理",
        tag: "AI 里程碑",
        desc: "打破 App 孤岛，用一句自然指令自动在订票、日程、微信与地图等多个应用之间完成多步复杂任务。"
      },
      {
        title: "空间多设备无缝协同",
        tag: "生态互联",
        desc: "与 Vision 系列头显和 Mac 实现空间视界无感流转，手机悬浮即可化作空间触控板或立体信息看板。"
      },
      {
        title: "端云协同隐私计算 Enclave 2.0",
        tag: "隐私基准",
        desc: "将私有云计算安全边界推至硬件层，保障任何大模型请求均无法被苹果及第三方窥探。"
      }
    ],
    newFeatures: [
      "跨应用 Agentic 智能自主操作 (Cross-App Agentic Assistant)：用户仅需一句自然语言指令，Siri 即可跨越微信、日历、航班与地图多个 App 自动执行复杂操作链",
      "空间多设备视界无缝流转：iPhone 靠近 Vision 头显或 Mac 屏幕时，自动展开为悬浮立体触控扩展板",
      "灵动岛 2.0 多任务并行展开：支持多任务双胶囊独立常驻，支持轻扫展开微型悬浮小窗自由切换",
      "全景动态场景渲染壁纸：壁纸随全球天气与当地时间呈现真三维景深昼夜自然更迭",
      "统一操作按钮 (Action Button) 地理与时间自适应：支持根据不同时段（工作/下班）与地理围栏自动切换功能",
      "备忘录协同智能画板：支持自动手绘几何形状规整校正与语音同步转写草图联想",
      "音乐全景空间音频重塑：AI 实时将普通双声道立体声无损转码为空间音频环绕声场"
    ],
    changesAndImprovements: [
      "隔空投送 (AirDrop) 极速互联协议重构：近距离握手延迟降低 70%，无线文件传输速率翻倍",
      "智能算力动态调度 2.0：大型 3D 游戏长时间高负载下发热量降低 15%，帧率波动减少",
      "邮件智能归纳助理：长邮件自动提取核心待办事项与行动清单并一键加入系统日程",
      "相册面部与敏感证件独立二次面容加锁保护"
    ],
    securityAndSystem: [
      "私有云计算 (Private Cloud Compute) 安全边界升级至硬件 Enclave 2.0",
      "系统架构与命名代际统一对齐，承接 iOS 18 之后的全新演进基石",
      "设备端身份令牌防窃取保护：抵御先进网络会话劫持与仿冒钓鱼"
    ],
    droppedDevices: ["iPhone XS", "iPhone XS Max", "iPhone XR"],
    supportedDevices: [
      "iPhone 17 系列 (17 / Pro / Pro Max / 17e)",
      "iPhone 16 系列 (16 / Plus / Pro / Pro Max / 16e)",
      "iPhone 15 系列 (15 / Plus / Pro / Pro Max)",
      "iPhone 14 系列 (14 / Plus / Pro / Pro Max)",
      "iPhone 13 系列 (13 / mini / Pro / Pro Max)",
      "iPhone 12 系列 (12 / mini / Pro / Pro Max)",
      "iPhone 11 系列 (11 / Pro / Pro Max)",
      "iPhone SE (2nd & 3rd gen)"
    ]
  };

  // 移除已有的 27 和 26 避免重复
  db.versions = db.versions.filter(v => v.num !== 27 && v.num !== 26);
  // 插入到最前
  db.versions.unshift(v27, v26);

  await writeFile('data/ios-history.json', JSON.stringify(db, null, 2) + '\n', 'utf8');
  console.log('✓ 成功写入 iOS 27 与 iOS 26，当前总版本数:', db.versions.length);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
