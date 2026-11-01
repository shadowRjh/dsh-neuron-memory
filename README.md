# dsh-neuron-memory

给 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 的**仿神经元记忆框架 + 3D 记忆星云面板**，一个插件。

记忆不是全量塞进上下文，而是像生物记忆一样分层：

```
一轮对话结束
  └─ 自动归类 → 海马体（原始片段，去重、过滤噪音）
        └─ 夜巡（默认每天 03:10）→ 按关键词分池 → 记忆库（可审计 JSONL）
              └─ 下沉 / 遗忘（艾宾浩斯半衰期 + 分层生命周期）
用户开口
  └─ 关键词相关性打分 → 只注入命中的前 N 条（非全量）
        └─ 命中即 touch：权重 +0.15、重置衰减计时 = 间隔重复 / 记忆巩固
```

## 特性

- **海马体缓冲**：每轮对话原文自动进缓冲，按 `(role + 文本)` 去重，过滤 system-reminder 等噪音
- **夜巡归档**：每天定时把缓冲片段按关键词分池写入记忆库，并生成 `patrol/YYYY-MM-DD.md` 报告；也可随时手动触发
- **相关性注入**：中文按二元组、英文按词切分，`相关度 × 0.75 + 有效权重 × 0.35` 排序，只注入前 N 条（默认 6 条 / 900 字），**不注入全量**
- **艾宾浩斯遗忘**：每个池独立配置「宽限期 / 半衰期 / 归档天数」，有效权重 `w = raw × 0.5^((age - grace) / halfLife)`
- **间隔重复**：被注入命中或被 `neuron_recall` 想起，权重 +0.15、衰减计时重置
- **跨会话 / 抗压缩**：注入在宿主侧每轮重新计算，上下文被压缩后仍能重新命中；所有会话共享一个记忆库
- **交接层（v2.1）**：`handoff.md` 覆盖写、硬上限 4KB，每轮固定注入「当前交接（项目/已完成/下一步/卡在）」——新会话开场就知道干到哪
- **硬上限（v2.1）**：单条记忆 ≤2KB、每池 ≤200 条，超出自动裁剪/按权重归档，防止记忆库无限膨胀
- **翻旧账（v2.1）**：直接解压历史会话归档（多帧 zstd），按关键词搜原话——上下文被压缩掉的细节还能找回
- **生态桥（v2.2）**：
  - **鱼的心情（dsh-feiyu-mood）**：读 `~/.dsh/feiyu-mood/state.json`，每轮注入「当前心情（数值/情绪/理由）」，面板里多一个心情节点
  - **鱼的记忆（dsh-fish-memory）**：读 `~/.dsh/fish-memory/*.json`，首次启动自动导入（也可随时 `neuron_import_fish` 重跑），长期事实进「核心」池，按重要度折算权重，按文本去重
- **交接最小化 + 自动压缩（v2.3）**：交接全量存盘，但每轮只注入「项目 / 下一步 / 卡在」三行（默认 ≤600 字）；每 12 轮或超过 800 字时自动压缩重写，旧版留档
- **情绪层（v2.3）**：心情变化 ≥5 自动落一条情绪记忆；心情与记忆情感同向时召回加权；情绪记忆被想起时额外强化；面板显示心情时间线
- **3D 星云面板**：中心 DSH → 记忆池 / 交接层 / 心情 → 条目（半径/亮度按有效权重），外圈是会话 / 思维链 / 服务 / 花费 / 插件 / 系统；每帧旋转 + 透视投影，可拖动旋转、滚轮缩放、点击看详情
- **多主题 + 任务信号（v2.4）**：星云 / 皮层 / 矩阵 / 极简 四套主题可切换；条目被想起时信号从中心脉冲到节点并沿边扩散，节点闪环
- **向量检索（v2.4，可选）**：`retrieval.vector.enabled` 打开后走本地 embedding（Ollama bge-m3 或 OpenAI 兼容接口），与关键词混合召回；服务不可用自动退回关键词，不影响对话

## 安装

```bash
# 从 npm（发布后）
dsh plugin --profile <profile> add dsh-neuron-memory

# 本地源码
dsh plugin --profile desktop add link:/path/to/dsh-neuron-memory
```

重启 DSH 后，会话界面出现 **「神经元」** 标签。

## 工具

| 工具 | 作用 |
|---|---|
| `neuron_status` | 记忆库/海马体/生命周期/参数总览 |
| `neuron_recall` | 按查询回想记忆（命中即强化） |
| `neuron_remember` | 写一条记忆（默认进海马体，可指定池） |
| `neuron_archive` | 海马体片段归档进记忆库 |
| `neuron_touch` | 手动强化（权重 +0.15、重置衰减） |
| `neuron_patrol` | 立刻跑一次夜巡 |
| `neuron_forget` | 软删除某条记忆（归档，保留原文可审计） |
| `neuron_handoff` | 写/读交接层（覆盖写，≤4KB，每轮固定注入） |
| `neuron_search` | 搜历史会话原文（多帧 zstd，关键词命中） |

## 存储

全部本地，无云端、无遥测：

```
~/.dsh/memories/.neuron/
  hippocampus.jsonl      原始片段（待归档）
  entries.jsonl          记忆库（池 / 权重 / 生命周期 / 召回次数）
  handoff.md             交接层（覆盖写，≤4KB）
  handoff-history.jsonl  每次覆盖前的旧交接（可审计）
  config.json            可调参数
  patrol/YYYY-MM-DD.md   夜巡报告
```

首次启动时若存在旧 `dsh-chain` 的 `~/.dsh/memories/.chain-shared/chains.jsonl`，会自动一次性迁移进记忆库。

## 配置

`~/.dsh/memories/.neuron/config.json`（改完下一轮生效）：

```jsonc
{
  "capture":   { "enabled": true, "includeAssistant": true, "maxHippocampus": 400, "maxChars": 1200 },
  "injection": { "budgetChars": 900, "maxItems": 6, "minWeight": 0.08 },
  "patrol":    { "hour": 3, "minute": 10, "autoArchive": true, "maxArchivePerRun": 24 },
  "limits":    { "maxEntryChars": 2000, "maxPerPool": 200, "handoffMaxChars": 4000 },
  "handoff":   { "enabled": true },
  "pools": {
    "core":    { "label": "核心", "halfLifeDays": 60, "graceDays": 20, "archiveDays": 180 },
    "fact":    { "label": "事实", "halfLifeDays": 45, "graceDays": 10, "archiveDays": 120 },
    "skill":   { "label": "技能", "halfLifeDays": 90, "graceDays": 20, "archiveDays": 365 },
    "daily":   { "label": "日常", "halfLifeDays": 20, "graceDays": 5,  "archiveDays": 90  },
    "emotion": { "label": "情绪", "halfLifeDays": 3,  "graceDays": 1,  "archiveDays": 14  }
  }
}
```

## 隐私

- 数据只写 `~/.dsh/memories/.neuron/`，不联网、不调模型
- 面板只读本机文件与 localhost 服务（TDAI shim/core/面板，可选）
- 记忆内容是对话原文，发布/分享数据前请自行脱敏

## Compatibility

- DSH: `>=0.2.0-rc.2 <0.3.0-0`
- Node.js: `>=22`（`neuron_search` 的 zstd 解压需要 >=22.15；DSH 0.2.1 自带 Node 24）

## License

MIT
