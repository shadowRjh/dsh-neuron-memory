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
- **3D 星云面板**：中心 DSH → 记忆池 → 条目（半径/亮度按有效权重），外圈是会话 / 思维链 / 服务 / 花费 / 插件 / 系统；每帧旋转 + 透视投影，可拖动旋转、滚轮缩放、点击看详情

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

## 存储

全部本地，无云端、无遥测：

```
~/.dsh/memories/.neuron/
  hippocampus.jsonl     原始片段（待归档）
  entries.jsonl         记忆库（池 / 权重 / 生命周期 / 召回次数）
  config.json           可调参数
  patrol/YYYY-MM-DD.md  夜巡报告
```

首次启动时若存在旧 `dsh-chain` 的 `~/.dsh/memories/.chain-shared/chains.jsonl`，会自动一次性迁移进记忆库。

## 配置

`~/.dsh/memories/.neuron/config.json`（改完下一轮生效）：

```jsonc
{
  "capture":   { "enabled": true, "includeAssistant": true, "maxHippocampus": 400, "maxChars": 1200 },
  "injection": { "budgetChars": 900, "maxItems": 6, "minWeight": 0.08 },
  "patrol":    { "hour": 3, "minute": 10, "autoArchive": true, "maxArchivePerRun": 24 },
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
- Node.js: `>=22`

## License

MIT
