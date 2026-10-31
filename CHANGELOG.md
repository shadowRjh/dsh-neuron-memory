# Changelog

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
