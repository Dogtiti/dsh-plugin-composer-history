# dsh-plugin-composer-history

[![npm](https://img.shields.io/npm/v/dsh-plugin-composer-history?label=npm&color=2f6fed)](https://www.npmjs.com/package/dsh-plugin-composer-history)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![dsh](https://img.shields.io/badge/DSH-%5E0.2.1--0-2f6fed)](https://github.com/deepseek-ai/deepseek-harness)

在输入框中按 `↑` / `↓` 逐条回溯本会话已发送的消息，并回填为草稿。

---

## 效果

输入框为空时按 `↑` 从最近一条开始向前回溯，`↓` 向前返回。回溯时右下角显示位置：

```
3/19        ← 当前第 3 条（由新到旧），共 19 条

↑  然后再开发一个插件 就是在输入框按上下键 能按顺序回填之前发过的消息
↑  换
↓  换
↓  （恢复原草稿）
```

越过最新一条后，恢复开始回溯前的草稿。手动编辑即退出回溯。

---

## 安装

**市场索引**

```
https://raw.githubusercontent.com/Dogtiti/dsh-plugin-composer-predict/main/market-index.json
```

设置 → 插件 → 启用实验性市场 bundle → Discover → 添加上面的地址 → 安装 `dsh-plugin-composer-history`。

**npm**

```bash
npm i dsh-plugin-composer-history
```

在 Plugins 页用「添加」填写包名。

**本地目录**

```bash
git clone https://github.com/Dogtiti/dsh-plugin-composer-history
```

Plugins → 添加 → 选择该目录。

---

## 行为

| 按键 | 行为 |
| --- | --- |
| `↑` | 输入框为空时开始回溯，从最近一条向前；到达最旧一条后停止 |
| `↓` | 向前返回；越过最新一条时恢复原草稿 |

不接管的情况：

| 条件 | 行为 |
| --- | --- |
| 输入框已有内容或附件 | `↑` 保留给编辑器的光标与选区移动 |
| 焦点不在该输入框 | 不处理 |
| 带 Alt / Ctrl / Cmd / Shift | 不处理 |
| `/` 或 `@` 菜单已认领输入 | 方向键归菜单 |

---

## 配置

```yaml
- insert:
    - id: composer-history
      name: 'dsh-plugin-composer-history'
      config:
        limit: 50
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；关闭后路由返回 503，客户端不接管按键 |
| `limit` | `200` | 保留的历史条数（取最近） |
| `maxChars` | `2000` | 单条消息最大字符数（保留头尾） |
| `cacheTtlMs` | `30000` | 相同会话事件序号下的缓存时间 |

---

## 实现

```
┌──────────────── 浏览器 ────────────────┐        ┌───────────── Host ─────────────┐
│ conversation.composer.dock             │        │ POST /api/composer.history     │
│  · 捕获阶段拦截 ↑ / ↓                    │  HTTP  │  · sessions.get(id)            │
│  · 状态机：index = -1 表示未回溯          │ ─────► │  · session.deriveMessages()    │
│  · setDraft(items[index])               │ ◄───── │  · 按 source kind 过滤          │
│  · 位置计数，编辑后退出                    │  JSON  │  · 按 seq 缓存 30s             │
└────────────────────────────────────────┘        └────────────────────────────────┘
```

历史来自会话日志。Host 侧仅保留 `role: user` 且 `source.kind === 'user'` 的文本，其余按来源排除：

```jsonc
{ "kind": "user" }             // 用户输入，计入历史
{ "kind": "runtime-context" }  // 运行时上下文快照，排除
{ "kind": "skill-catalog" }    // 技能目录，排除
{ "kind": "time-context" }     // 时间戳提示，排除
{ "kind": "user-approval" }    // 审批策略通知，排除
```

相邻重复消息合并为一条。结果按会话事件序号缓存 30 秒。

回填使用 `inputActions.setDraft()`，与手动输入共用同一条草稿链路（可撤销、按会话持久化），不直接操作 DOM。

---

## 兼容性

- DSH `^0.2.1-0`（`engines.dsh`）。
- 依赖公开的 `inputActions.setDraft()`。

---

## 开发

```bash
node --test "test/*.test.mjs"
```

11 项：提取顺序、注入内容过滤、相邻去重、数量与长度限制、缓存失效、开关、槽位注册形状、计数渲染、缺少 hooks 时不渲染。

---

## 相关插件

| 插件 | 说明 |
| --- | --- |
| [dsh-plugin-composer-predict](https://github.com/Dogtiti/dsh-plugin-composer-predict) | 预测下一条指令并显示为占位文字，`Tab` 采纳 |
| **dsh-plugin-composer-history**（本仓库） | 输入框中按 `↑` / `↓` 回填历史消息 |

## 许可

MIT © [Dogtiti](https://github.com/Dogtiti)
