# Changelog

## 2.0.0

- 合并「思维链 / 神经元 / 神经元记忆」三个插件为一个：唯一标签页「神经元」
- 客户端重写为真 3D 星云：每帧绕 Y/X 旋转 + 透视投影（近大远小、深度衰减）、3D 脉冲、拖动旋转、滚轮缩放、点击节点看详情
- 宿主新增合并接口 `GET /neuron/api/data`：记忆池/条目/统计 + 会话 + 花费 + 插件 + 服务 + 系统 + 思维链计数
- 首次启动自动迁移旧 `dsh-chain` 的 `chains.jsonl`（一次性）
- 保留 `/neuron-memory/api/data` 兼容旧面板

## 1.0.0

- 首个版本：海马体 → 夜巡 → 分池 → 相关性注入；艾宾浩斯半衰期 + 分层生命周期 + 被想起延长
- 7 个工具：`neuron_status` / `neuron_recall` / `neuron_remember` / `neuron_archive` / `neuron_touch` / `neuron_patrol` / `neuron_forget`
