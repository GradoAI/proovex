# Proovex（谱维斯）

[English](./README.md) | 简体中文

证明你的 AI Agent 实际做了什么。

Proovex 是一个开放、可插拔、面向 AI Agent 的 Evidence Runtime。

捕获 Agent 的真实操作，观察其产生的影响，并独立验证实际发生了什么。

**当前状态：早期产品化 / 孵化阶段。独立实现尚不可用。**

“谱维斯”是面向人的中文产品名；工程 ProjectIdentity、仓库、package / protocol、Stage / Proof / Work ID 仍保持 `proovex` / Proovex。

![Proovex — Agent Action → Evidence → Verification → Trusted Outcome](./assets/proovex-hero.svg)

## Proovex 是什么

Proovex 为 AI Agent 提供 Evidence（证据）与验证基础设施。其目标是将每次 Run（运行）与 Agent 的实际操作、真实系统中的变化，以及独立 Verification（验证）能够证明的结果关联起来。

## 为什么需要 Proovex

Agent 的输出是一种声明。Proovex 将 Agent 的执行过程转化为可验证的 Evidence。

AI Agent 的 Evidence 应将操作、观察到的副作用以及 Verifier（验证器）的结果关联起来。这样，Agent 验证就能超越自报成功，为 Agent 评估、安全和审计提供依据。

## Evidence 与 Trace 有什么区别

Trace 通常描述执行路径与时序，也可以包含有用的 Evidence。但一条工具调用记录本身，不能证明目标系统真的发生了预期变化。

Proovex 的目标是把操作记录、独立观察、来源与明确的验证断言关联起来。Verification 只证明相应断言得到现有 Evidence 的支持；它不代表整个系统安全，也不代表所有副作用都已被发现。

## 能证明什么：一个具体例子

**概念示例，不是运行结果、可执行示例或正式 schema。** 假设 Agent 声称已将一份报告保存到指定路径：

| 环节 | 需要的依据 |
|---|---|
| 声明 | Agent 报告“文件已保存” |
| 操作 | 写入指定路径的请求，关联到同一次 Run |
| 独立观察 | 在操作后读取目标文件，记录来源、时间及内容摘要 |
| Evidence | 将写入请求、观察结果与文件产物关联，保留各自来源 |
| Verification | Verifier 检查观察到的内容摘要是否与预期一致 |
| 结果边界 | 匹配只支持内容一致这一断言；不匹配应失败；缺失可信观察则保持未知 |

“Trusted Outcome”指有可追溯 Evidence 支持的具体结论，而不是对 Agent 的笼统信任。

## 核心流程

```text
Capture → Normalize → Store → Verify → Query
```

即捕获、规范化、存储、验证与查询。Collector（采集器）负责捕获 Evidence，Verifier 负责独立评估。整个流程保留 Agent 声明与实际观察结果之间的区别。缺失的 Evidence 保持未知，不能被视为成功。

## Proovex 捕获什么

计划覆盖的采集范围包括：

- 操作
- 观察结果
- 状态变化
- 副作用
- 产物
- Verification 结果

这些是目标 Evidence 类别，不代表独立 Collector 已经交付。

## 面向谁

- AI Agent，包括编程、浏览器和 MCP Agent
- RPA 与计算机使用自动化（CUA）
- 评估、安全、治理与审计集成

## 目标使用场景

以下是计划中的使用体验，不是当前可用功能：

- **编程 Agent：文件真的改了吗？** 将写入操作与独立观察到的文件内容关联，验证明确的内容断言。
- **浏览器 Agent / RPA / CUA：操作生效了吗？** 检查操作后的状态，而不把点击或工具成功返回当作结果证明。
- **评估、安全与审计：结论依据是什么？** 查询 Run 的 Evidence 和 Verification 结果，区分自报结果、观察事实及仍未知的部分。

## 原则

- 厂商中立
- 可插拔
- 独立观察
- 默认可验证
- Evidence 优先于自我报告

## 产品形态

本节是已接受的 Proovex Product Reality（[ChatGPT-doc `docs/proovex-product-reality-prd.md`](https://github.com/GradoAI/ChatGPT-doc/blob/main/docs/proovex-product-reality-prd.md) §5.2）的投影。README 只是投影，不是 authority：它不定义 Stage、Proof、requirement、backlog、Task、Issue、API contract 或实现承诺。

| 产品层 | 涵盖内容 |
|---|---|
| **PROVE** | Claim、Evidence Set、Verification Contract、Verification Result、缺失的 Evidence / 未知 |
| **INSPECT** | Run、Observation、Evidence、provenance、artifact / subject binding、解释 / 审计历史 |
| **CONNECT** | Agent runtimes、Relay、Git / CI、MCP、source adapters / producers、外部 evidence producers |

PROVE / INSPECT / CONNECT 是同一个 Evidence Runtime 的产品 taxonomy，不是三套 runtime、Evidence model、authority 或 backlog。

两条产品化原则：

> **One Evidence Plane → Many Projections**

> **Put verifiable evidence where claims and decisions happen.**

所有入口共享同一套 Observation、Evidence、Claim、Verification Contract 与 Verification Result，任何入口都不能创造第二份 Evidence truth。Proovex 把 Evidence 放到决策发生的地方，但不因此成为 workflow authority；Relay 的运行 / 对账事实也不等于 Proovex Verification。

**Task-shaped verification。** 未来的入口应回答这样的问题：这个 claim 是否真的发生？哪些 Evidence 支持它？哪些反驳它？缺哪些 Evidence？结果绑定到哪个 artifact / subject？为什么是 `VERIFIED`、`CONTRADICTED` 或 `INSUFFICIENT_EVIDENCE`？用了哪些 Source Facts？这些只是示例，不是 API contract，也不是 backlog。

**确定性结果，可选叙述。** Verification Result 是确定性的、受 contract 约束的产品事实；面向人的解释只是建立在 Evidence 与 provenance 之上的可选投影，永远不能改变结果。

**缺失与过时必须可见。** 未来的入口必须显示 source 时间、Observation 新鲜度、Evidence 覆盖、缺失的 Evidence 和 `INSUFFICIENT_EVIDENCE`。这不是新的确定性或评分引擎。

**First Verified Run 是预期的 Quick Start。** 一个真实 Source Fact → 一个明确 Claim → 一个具体 Evidence Set → 一个确定性 Verification Result → 一条可检查的 provenance 链。它复用现有 Stage-1 的 proof 工作，不新增 Stage 工作，目前尚不存在。

**可能的产品入口（目前都不可用）：**

- **Agent Verification Surface**：未来入口；没有 SDK、CLI 或 API。
- **Human Audit Surface**：未来入口；没有可运行的审计 / 查询。
- **CI / Gate Surface**：作为入口是未来的；CI 结果已可作为 Source Fact。
- **Workspace / Estate Surface**：未来的企业入口。

**不属于 Proovex Core。** Repository intelligence（代码图谱、代码健康、dead code、wiki、风险评分、git archaeology、重构）不定义 Evidence Runtime 语义；这类系统可以作为 source、producer、evidence 来源、consumer 或 adapter 接入。

## 当前状态

**早期产品化。现在还不能试用独立运行时。** 本仓库提供产品定义与路线图，尚无可运行的 SDK、CLI、API 或 Quick Start。

当前现实（来自已接受的 Product Reality）：

- 产品可用性：**INCUBATION**，独立的 Evidence Runtime 尚不可用。
- `PVX-STAGE-1 — Prove Evidence` 为 **ACTIVE**；`PVX-S1-P1..P5` 全部 **UNPROVEN**；`WP-PVX-S1-P1..P5` 为 **READY**。First Real Producer、First Verified Run 与 False Claim Detection 尚未实现或证明。
- 仓库目前只有 foundation / kernel 包；private 的 `proovex foundation info --json` 探针不是产品 CLI。

Proovex 的 Evidence、信任、Verification 和评估能力最初在 grado-companion-kit 中开发、孵化和验证。

独立代码提取须通过单独的决策和 Work Item；本仓库不并行维护第二套运行时实现。文中描述的使用体验仍是目标，并非已交付功能。

“开放”指预期的集成接口。

英文 README 是权威产品定义，中文版是其准确本地化。

## 愿景

阅读 [Vision](./VISION.md)，了解长期方向、独立性原则和产品边界。该文档目前为英文。

## 路线图

阅读 [Roadmap](./ROADMAP.md)，了解计划中的产品阶段及核心运行时范围之外的内容。该文档目前为英文。尚未承诺发布日期。

## 许可证

Proovex 基于 Apache License 2.0 开源。详见 [LICENSE](./LICENSE)。
