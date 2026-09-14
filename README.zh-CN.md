# Proovex

[English](./README.md) | 简体中文

证明你的 AI Agent 实际做了什么。

Proovex 是一个开放、可插拔、面向 AI Agent 的 Evidence Runtime。

捕获 Agent 的真实操作，观察其产生的影响，并独立验证实际发生了什么。

**当前状态：早期产品化 / 孵化阶段。独立实现尚不可用。**

## Proovex 是什么

Proovex 为 AI Agent 提供 Evidence（证据）与验证基础设施。其目标是将每次 Run（运行）与 Agent 的实际操作、真实系统中的变化，以及独立 Verification（验证）能够证明的结果关联起来。

## 为什么需要 Proovex

Agent 的输出是一种声明。Proovex 将 Agent 的执行过程转化为可验证的 Evidence。

AI Agent 的 Evidence 应将操作、观察到的副作用以及 Verifier（验证器）的结果关联起来。这样，Agent 验证就能超越自报成功，为 Agent 评估、安全和审计提供依据。

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

## 原则

- 厂商中立
- 可插拔
- 独立观察
- 默认可验证
- Evidence 优先于自我报告

## 当前状态

Proovex 正在将最初于 grado-companion-kit 中孵化并验证的能力进行产品化。

当前实现仍位于 grado-companion-kit。本仓库是正式产品主页和未来独立仓库的边界，不是第二份实现源。上述能力描述的是产品方向，不代表独立运行时已经交付。

代码提取必须通过独立的提取决策和 Work Item 完成。本仓库没有复制运行时代码，也不并行维护同一套实现。

“开放”描述的是预期的集成接口。本仓库尚未授予开源许可证，许可证策略仍待决定。

英文 README 是权威产品定义；简体中文 README 是其本地化版本，不构成另一套产品定义。

## 愿景

阅读 [Vision](./VISION.md)，了解长期方向、独立性原则和产品边界。该文档目前为英文。

## 路线图

阅读 [Roadmap](./ROADMAP.md)，了解计划中的产品阶段及核心运行时范围之外的内容。该文档目前为英文。尚未承诺发布日期。
