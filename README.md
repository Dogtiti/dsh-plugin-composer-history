# dsh-plugin-composer-history

DeepSeek Harness 插件：在输入框里按 **↑ / ↓** 像终端一样回溯**本会话发过的消息**，按顺序回填成草稿。

DeepSeek Harness plugin: shell-style prompt history in the composer. **ArrowUp** walks back through the messages you already sent, **ArrowDown** walks forward and restores your draft at the end.

```
输入框为空时：
  ↑  帮我建个公开仓库
  ↑  发 npm
  ↓  发 npm
  ↓  （回到空草稿）
```

## 中文

### 行为

- **↑**：输入框为空时开始回溯，从**最近一条**已发送消息往前翻。每按一次往前一条，到最旧为止。
- **↓**：往回走。走到比最新一条更新时，恢复你开始回溯前的草稿（通常是空的）。
- 回溯期间输入框下方右侧会显示 `3/12` 这样的位置计数。
- 你一旦自己输入、粘贴或用别的快捷键改了草稿，回溯状态立即退出，不会和编辑打架。

### 不接管的情况

- 输入框里**已经有内容**（或已挂附件）时按 ↑ —— 交给编辑器做光标/选区移动，不改变文本。
- 光标不在输入框里、或焦点在另一个 composer 里。
- 组合键带 Alt / Ctrl / Cmd / Shift（例如 Cmd+↑），留给系统和宿主快捷键。
- 斜杠命令或 `@` 引用菜单已认领输入（`phase !== 'plain'`），方向键属于菜单。
- 一次性子会话等只读输入框不显示时，自然也不会接管。

### 数据来源

Host 半读**会话日志**（`session.deriveMessages()`），只保留 `role === 'user'` 且 `source.kind === 'user'` 的文本消息：

- 跳过运行时注入的内容（系统提示、开发者通知、`<runtime-context>` 这类以 `<` 开头的块）；
- 相邻重复的相同消息只保留一条；
- 默认最多 200 条、每条最多 2000 字符（超出保留头尾）。

结果按会话事件序号缓存 30 秒，所以连按 ↑ 不会反复解析日志。

### 配置

`cordis.patch.yml` 的 `config`：

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `limit` | `200` | 保留的历史条数（取最近的） |
| `maxChars` | `2000` | 单条消息最大字符数 |
| `cacheTtlMs` | `30000` | 同一会话事件序号下的缓存时间 |

### 安装

本地目录安装：Plugins → 添加 → 选这个目录。市场索引与 npm 发布后可直接填包名。

### 开发

```bash
node --test "test/*.test.mjs"    # 11 项：提取规则、去重、裁剪、缓存、开关、注册形状
```

## English

### Behavior

- **ArrowUp** with an empty composer starts history at the most recent sent message and walks backwards, one prompt per press.
- **ArrowDown** walks forward; past the newest prompt it restores the draft you had before browsing.
- While browsing, a small `3/12` counter sits at the right edge of the composer dock.
- Any other edit (typing, paste, undo) leaves browse mode immediately.

The plugin never takes the key when the composer already has text or attachments, when focus is outside this composer, when a modifier is held, or when the slash/reference menu owns the input.

### Data

The Host half reads the Session log (`session.deriveMessages()`), keeps `role: 'user'` messages whose source is the human, skips injected context blocks, collapses consecutive duplicates, and caps length and count. Answers are cached per Session event sequence for 30 seconds.

## License

MIT
