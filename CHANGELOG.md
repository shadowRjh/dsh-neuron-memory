# Changelog

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
