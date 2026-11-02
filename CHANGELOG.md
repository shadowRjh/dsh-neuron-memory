# Changelog

## 2.7.0

- **数据修复**：`neuron_repair` 工具 + 方案面板按钮——清理历史噪音、条目/海马体去重、补 `tier/importance/due`；写前自动备份到 `backups/`
- **配置安全**：保存前数值范围校验（注入条数/字数、事实卡、到期、各档半衰期等）；每次改动前留 `config-history/` 快照（保留 10 份）；支持「恢复默认配置」
- **星图聚类**：叶子向所属池 hub 收拢，形成按池可读的簇（不再是一团随机星云）
- 新增接口动作：`repair`、`config-reset`

## 2.6.0

- 导航改为**插件内左侧竖栏**（星图 / 概览 / 记忆 / 方案 / 设置），不再与 DSH 自身的「设置」混淆
- 新增**「方案」面板**：遗忘模型（预设 + 各档半衰期）、运行模式（full/log/off）、写入门开关、事实卡字数、到期窗口，即时保存到 `config.json`
- 设置面板新增**自由定制**：节点形状（圆/方/菱形）、连线亮度，与主题、强调色、字号、自动旋转一起持久化
- 宿主新增 `POST /neuron/api/action` 的 `config` 动作（深合并写配置）

## 2.5.0

- **工作台式 UI**（参考 Ido1um 工作台）：顶栏导航「星图 / 概览 / 记忆 / 设置」；概览含记忆库、分档半衰期、运行状态、到期待办；记忆面板可按权重浏览并对单条「想起 / 归档」；设置面板可切主题、自定义强调色、字号、自动旋转
- **主题**：星云 / 皮层 / 矩阵 / 极简 / **自定义**（强调色），localStorage 记忆
- **星图布局**：撒点后做 60 步轻量力导向松弛，减少重叠；到期条目钉在外圈，避免被吸进中心
- **记忆模型（移植自 Ido1um）**：
  - 分档衰减 `hard / long / general / temp`，硬事实不衰减；二维打分 `score = 重要性 I × 保持度 R`
  - 写入门：meta / quoted / uncertain / transient 四类不写库，并统计跳过数
  - 长期事实卡：硬事实/长期条目投影，默认 1500 字，**一次会话只注入一次**
  - 到期/待办：明说「明天/后天/周X/日期」自动抽 due，注入「到期 / 待办」块
  - 审计 `neuron_audit`：原文重放比对，找漏记；体检 `neuron_doctor`：10 项只读检查
  - 会话策略 `full / log / off`；三档预设 conservative / balanced / aggressive
  - 事件日志 `events.jsonl`；UI 的「想起/归档」走 `POST /neuron/api/action`

## 2.4.0

- **多主题 3D 面板**：星云 / 皮层 / 矩阵 / 极简 四套可选主题（记忆在 localStorage，不重启切换）；矩阵主题带网格与扫描线，皮层主题为菱形节点与紫色调
- **任务信号**：条目被想起（recalls 增长）时，信号从中心脉冲式传向该节点并沿边扩散，节点闪环高亮
- **向量检索（可选开关，默认关）**：`retrieval.vector.enabled`；接 Ollama bge-m3 或 OpenAI 兼容 embeddings，查询/条目向量按需缓存到 `vectors.jsonl`，与关键词按 `blend` 混合；服务不可达时自动退回关键词，不阻塞对话
- 面板侧栏新增「检索」状态（开/关、模型、缓存条数、服务是否离线）

## 2.3.1

- **面板交互修复**：不再每帧覆盖 `pitch`，现在可以上下左右拖动旋转；俯仰范围放宽到 ±1.35
- **指向处缩放**：滚轮以光标为中心缩放（0.4×–4×），不再是固定中心缩放
- **双击聚焦**：双击节点把它移到屏幕中心并放大；双击空白处在光标处放大
- **右键重置**：视角/缩放/平移一键回到初始状态

## 2.3.0

- **交接最小视图**：`handoff.md` 全量存盘，但每轮只注入「项目 / 下一步 / 卡在」三行（`handoff.injectChars`，默认 600 字），固定上下文占用大幅下降
- **自动压缩**：每 `compactEveryTurns` 轮（默认 12）或交接超过 `compactThreshold`（默认 800 字）时，自动把交接压缩重写，旧版进 `handoff-history.jsonl`
- **情绪事件落库**：心情变化 ≥ `emotion.eventMinDelta`（默认 5）时，自动写一条情绪记忆（如「心情 70 → 78（开心）：被夸了」），进 emotion 池
- **情绪加权召回**：心情与记忆情感同向时召回排名 +`emotion.recallBoost`（默认 0.15），反向轻微抑制
- **情绪锚点**：情绪记忆被想起时额外强化 +`emotion.anchorBonus`（默认 0.1）
- **情绪时间线**：面板心情区显示最近 3 次心情变化
- **噪音过滤**：运行时上下文（Current working directory / Approval policy / Use the read tool 等）不再写进海马体

## 2.2.1

- 修复 v2.2.0 的启动崩溃：`FEIYU_STATE` / `FISH_DIR` 在 `DSH_HOME` 声明前使用，真实环境下（无 `NEURON_FEIYU_STATE` 等环境变量）模块 import 即抛 `ReferenceError: Cannot access 'DSH_HOME' before initialization`。已把生态桥路径常量移到 `DSH_HOME` 之后

## 2.2.0

- 新增**生态桥 · 鱼的心情**：读 `~/.dsh/feiyu-mood/state.json`，每轮固定注入「当前心情」（数值/五档/情绪维度/理由），3D 面板新增心情节点与侧栏；未安装时自动跳过
- 新增**生态桥 · 鱼的记忆**：读 `~/.dsh/fish-memory/*.json`（v2 库格式），首次启动自动导入，长期事实（`stable_profile`）进核心池、事件按关键词分池、按重要度折算初始权重、按文本去重；新增工具 `neuron_import_fish` 可随时重跑
- 配置新增 `bridges.feiyuMood` / `bridges.fishMemory`（均可用开关关掉）
- 说明：memOS / Hindsight 属外部记忆服务，speak-up / tts-bridge / 表情包属对话层，未并入核心；详见 README「生态兼容」

## 2.1.1

- 改进 `neuron_search` 的文本提取：递归解析 `data.inserted[].content[]` 与会话标题行，输出可读原话而不是原始 JSON

## 2.1.0

- 新增**交接层**：`neuron_handoff` 工具 + `handoff.md` 覆盖写（≤4KB），每轮固定注入「当前交接」，新会话开场即知进度；覆盖前自动留档 `handoff-history.jsonl`
- 新增**硬上限**：单条记忆 ≤2KB、每池 ≤200 条；超出自动裁剪、按权重/年龄归档（`enforceLimits`，夜巡时执行）
- 新增**翻旧账** `neuron_search`：直接解压历史会话多帧 zstd，按关键词搜原话，不依赖 Python
- 3D 面板新增交接层节点与侧栏交接体量
- 配置新增 `limits` / `handoff`，`version` 升到 2

## 2.0.0

- 合并「思维链 / 神经元 / 神经元记忆」三个插件为一个：唯一标签页「神经元」
- 客户端重写为真 3D 星云：每帧绕 Y/X 旋转 + 透视投影（近大远小、深度衰减）、3D 脉冲、拖动旋转、滚轮缩放、点击节点看详情
- 宿主新增合并接口 `GET /neuron/api/data`：记忆池/条目/统计 + 会话 + 花费 + 插件 + 服务 + 系统 + 思维链计数
- 首次启动自动迁移旧 `dsh-chain` 的 `chains.jsonl`（一次性）
- 保留 `/neuron-memory/api/data` 兼容旧面板

## 1.0.0

- 首个版本：海马体 → 夜巡 → 分池 → 相关性注入；艾宾浩斯半衰期 + 分层生命周期 + 被想起延长
- 7 个工具：`neuron_status` / `neuron_recall` / `neuron_remember` / `neuron_archive` / `neuron_touch` / `neuron_patrol` / `neuron_forget`
