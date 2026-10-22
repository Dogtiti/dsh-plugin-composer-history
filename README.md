# dsh-plugin-composer-history

[![npm](https://img.shields.io/npm/v/dsh-plugin-composer-history?label=npm&color=2f6fed)](https://www.npmjs.com/package/dsh-plugin-composer-history)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![dsh](https://img.shields.io/badge/DSH-%5E0.2.1--0-2f6fed)](https://github.com/deepseek-ai/deepseek-harness)

**输入框里的终端式历史。** 按 `↑` 从最近一条已发送消息往前翻，按 `↓` 走回来，走到底恢复你原来的草稿。

> 这是我给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 写的输入框插件之一，另一个是 [Composer Prediction](https://github.com/Dogtiti/dsh-plugin-composer-predict)（预测下一条指令，`Tab` 采纳）——见文末[更多插件](#更多插件)。

---

## 效果

输入框为空时按 `↑`，逐条往回填；按 `↓` 往前走。回溯时输入框下方右侧显示位置：

```diff
  3/19  ← 表示「最新往前的第 3 条」，共 19 条

+ ↑  然后再开发一个插件 就是在输入框按上下键 能按顺序回填之前发过的消息
+ ↑  换
+ ↓  换
+ ↓  （回到空草稿）
```

- 走到最新一条之后继续按 `↓`，恢复你**开始回溯前**的草稿（通常是空的）。
- 一打字就退出回溯，不会和你的编辑打架。

---

## 安装

**市场索引**（推荐）

```
https://raw.githubusercontent.com/Dogtiti/dsh-plugin-composer-predict/main/market-index.json
```

设置 → 插件 → 启用实验性市场 bundle → Discover → 添加上面的地址 → 安装 `dsh-plugin-composer-history`。
这个索引同时列出了我的两个输入框插件。

**npm**

```bash
npm i dsh-plugin-composer-history
```

在 DSH 的 Plugins 页用「添加」填包名即可。

**本地目录 / git**

```bash
git clone https://github.com/Dogtiti/dsh-plugin-composer-history
# Plugins → 添加 → 选这个目录
```

---

## 使用

| 按键 | 行为 |
| --- | --- |
| `↑` | 输入框为空时开始回溯，从最近一条往前翻；到最旧一条停住 |
| `↓` | 往前走；超过最新一条时恢复开始回溯前的草稿 |

以下情况**不接管**，把键还给编辑器或宿主：

| 情况 | 行为 |
| --- | --- |
| 输入框里已有内容或附件 | `↑` 做光标/选区移动，不替换文本 |
| 焦点不在这个 composer | 不处理 |
| 带 Alt / Ctrl / Cmd / Shift | 不处理（留给快捷键） |
| `/` 或 `@` 菜单已认领输入 | 方向键属于菜单 |

---

## 配置

在插件行的 `config` 里改（未声明的键会被忽略）：

```yaml
- insert:
    - id: composer-history
      name: 'dsh-plugin-composer-history'
      config:
        limit: 50
```

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；关掉后路由返回 503，客户端不接管按键 |
| `limit` | `200` | 保留的历史条数（取最近的） |
| `maxChars` | `2000` | 单条消息最大字符数（超出保留头尾） |
| `cacheTtlMs` | `30000` | 同一会话事件序号下的缓存时间 |

---

## 工作原理

```
┌──────────────── 浏览器 ────────────────┐        ┌───────────── Host ─────────────┐
│ conversation.composer.dock             │        │ POST /api/composer.history     │
│  · 捕获阶段拦截 ↑ / ↓                    │  HTTP  │  · sessions.get(id)            │
│  · 状态机：index = -1 表示未回溯          │ ─────► │  · session.deriveMessages()    │
│  · setDraft(items[index])               │ ◄───── │  · 按 source kind 过滤           │
│  · 计数 3/19，一编辑就退出                │  JSON  │  · 按 seq 缓存 30s             │
└────────────────────────────────────────┘        └────────────────────────────────┘
```

**历史从哪来？** 会话日志——唯一可信的来源。Host 半只保留 `role: user` 且 `source.kind === 'user'` 的文本。这不是猜内容像不像，而是按来源判定：

```jsonc
// 真实会话日志里 user/message 的 source kind
{ "kind": "user" }             // ← 你打的字，进历史
{ "kind": "runtime-context" }  // ← 每轮注入的运行时快照，不进历史
{ "kind": "skill-catalog" }    // ← 技能目录（3.4 万字符那种），不进历史
{ "kind": "time-context" }     // ← 时间戳提示，不进历史
{ "kind": "user-approval" }    // ← 审批策略变更通知，不进历史
```

相邻重复的消息会合并成一条（连发两次「继续」只占一格）。结果按会话事件序号缓存 30 秒，连按 `↑` 不会反复解析日志。

**为什么用 `setDraft()` 而不是模拟按键？** 它和手动输入走同一条草稿链路：可撤销、按会话持久化、和宿主的命令/引用芯片逻辑一致。

---

## 兼容性

- 需要 DSH `^0.2.1-0`（`engines.dsh`）。
- 依赖 `inputActions.setDraft()` 这个公开的草稿写入动作，不直接改 DOM。

---

## 开发

```bash
node --test "test/*.test.mjs"
# 11 项：提取顺序、注入内容过滤、相邻去重、limit/裁剪、缓存失效、开关、
#        槽位注册形状、计数渲染、缺 hooks 时不动
```

---

## 更多插件

我的 DSH 插件都围绕输入框，一个索引装下全部：

| 插件 | 一句话 |
| --- | --- |
| **Composer History**（本仓库） | 按 `↑`/`↓` 按顺序回填本会话发过的消息 |
| [**Composer Prediction**](https://github.com/Dogtiti/dsh-plugin-composer-predict) | 预测下一条指令，显示成占位文字，`Tab` 采纳 |

共用索引（上面两个都能从这里装）：
`https://raw.githubusercontent.com/Dogtiti/dsh-plugin-composer-predict/main/market-index.json`

## 许可

MIT © [Dogtiti](https://github.com/Dogtiti)
