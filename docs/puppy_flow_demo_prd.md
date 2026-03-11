
# PuppyFlow Demo PRD (v0.1)

## I. Product Positioning

A high-precision AI workflow orchestration system built on **Node Isolation** and **Strong Human-in-the-Loop (HITL)**. PuppyFlow is designed to eliminate hallucinations, context pollution, and the "precision decay" typically seen when processing large lists or long-running tasks.

## II. Core Architectural Settings

* **Frontend Experience**: A minimalist visual Web UI (e.g., based on React Flow). It focuses on displaying node connections and execution status while hiding complex technical configurations (like Headers or raw JSON Mapping).
* **Node Design Principle (SRP)**: Each node follows the **Single Responsibility Principle**. Nodes are categorized into two types:
* **Tool Node**: Performs a single utility action (e.g., raw search, web scraping).
* **LLM Node (Inference Node)**: Dedicated strictly to text processing, reasoning, or information extraction.


* **Topology**: Supports linear sequences and **Map-Reduce** (parallel processing of lists). The underlying data structure is a **DAG (Directed Acyclic Graph)**, allowing for future expansion into conditional branching.

---

## III. Core User Stories (Requirements)

### **US1: Minimalist Visual Orchestration (UI & UX)**

* **Requirement**: As a user, I can see my task decomposed into "Puppy Nodes" (card format) connected from left to right on the Web interface.
* **Details**: Cards only display the node name, input/output previews, and execution status (**Pending / Running / Done**). No technical clutter.

### **US2: Conversational Node Generation (Skill-Based)**

* **Requirement**: As a user, I can input a natural language prompt (e.g., *"Search for the latest AI Agent news and extract the core viewpoints"*), and the system automatically decomposes it into a chain of single-responsibility nodes (e.g., `Search Node` -> `Extraction Node`).

### **US3: Strict Node Context Isolation**

* **Requirement**: When executing `Node N`, the system only provides the output of `Node N-1` (or explicitly defined dependencies) as input.
* **Goal**: Prevent the LLM from being overwhelmed by the entire preceding chat history, ensuring the agent doesn't "drift" off-task.

### **US4: Basic Map-Reduce (Handling List Explosion)**

* **Requirement**: When `Node A` outputs an array (e.g., 5 URLs) to `Node B`, the system automatically spins up 5 parallel instances of `Node B`.
* **Details**: The results are automatically aggregated for the next node. The UI simplifies this into a single "batch processing" progress bar or a collapsible card group.

### **US5: Flexible Breakpoint Review (Human-in-the-Loop)**

* **Node-Level Approval Toggle**: Each card has a "Require Approval" switch.
* **High-Risk/Terminal Nodes** (e.g., sending an email, writing to a DB): Default to **ON**. Execution pauses until the user clicks `Approve`.
* **Low-Risk/Intermediate Nodes** (e.g., searching, formatting): Default to **OFF**. Flow continues automatically.


* **Intervention Options**: During a pause, users can:
* `Approve`: Proceed to the next node.
* `Edit`: Directly modify the node's output data in a text box to fix errors before continuing.
* `Reject`: Send the task back to the current node with specific feedback for a retry.



### **US6: Workflow Management & Dynamic Triggering**

* **Management Dashboard**: A dedicated interface to view, manage, and reuse saved historical workflows.
* **Dynamic Input Modal**: When clicking "Run Workflow," the system analyzes the "Root Node" requirements and pops up a simple form for the user to enter initial data (e.g., the specific `query`), rather than hard-coding it.
* **Auto-Save & Execution**: Clear distinction between "Save Workflow" (saving the draft) and "Run Workflow" (auto-saves changes, prompts for inputs, and triggers execution).

---

> **Note on Implementation**: The "Puppy" theme should carry through the UI—think of the nodes as specialized dogs (e.g., a "Retriever" for search, a "Sheepdog" for summarization). It makes the concept of SRP more intuitive for the user.


---

---

<br/><br/>


# PuppyFlow Demo 版 PRD (v0.1)

## 一、 产品定位

一个基于“节点隔离”与“强人类在环（Human-in-the-Loop）”的 AI 工作流编排系统，旨在解决长任务中的幻觉、上下文污染及大列表处理精度下降问题。

## 二、 核心架构设定

- **前端表现**：极简可视化 Web UI（例如基于 React Flow 或 Streamlit）。展示节点连线与执行状态，隐藏复杂的配置参数（如 Headers、JSON Mapping）。
- **节点设计原则 (SRP)**：单一职责。分为两类基础节点：
  - **Tool Node (工具节点)**：只做一件事（例如纯搜索、纯爬取）。
  - **LLM Node (推理节点)**：只负责文本处理/信息提取。
- **拓扑结构**：支持线性串联与 Map-Reduce（列表并发处理）。底层数据结构需支持 DAG（有向无环图）以备后期扩展条件分支。

## 三、 核心 User Story (需求列表)

**US1: 极简可视化编排 (UI & UX)**

- 作为用户，我可以在 Web 界面上看到任务被拆解为从左到右连线的“小狗节点”（卡片形式）。
- 卡片上只展示节点名称、输入/输出预览、以及执行状态（Pending/Running/Done），没有冗长的技术参数设置。

**US2: 对话式生成节点 (Skill-Based Nodes)**

- 作为用户，我输入一句自然语言（如“搜索关于 AI Agent 的最新新闻，并提取核心观点”），系统能自动将其拆解并生成对应的单一职责节点链（例如：`搜索节点` -> `提取节点`）。

**US3: 严格的节点上下文隔离**

- 作为系统，在执行 `节点N` 时，我只会把 `节点N-1` 的输出（或明确指定的依赖）作为输入。避免将前序所有对话全部塞给 LLM，确保执行不跑偏。

**US4: 基础 Map-Reduce (应对列表爆炸)**

- 作为系统，当 `节点A` 输出一个数组（如 5 个 URL）传递给 `节点B` 时，我会在后台自动拉起 5 个 `节点B` 实例并行处理，再由系统自动汇总给后续节点，用户在 UI 上只需看到一个“批处理”进度条或折叠卡片。

**US5: 灵活的断点审查 (Human-in-the-Loop)**

- **节点级审批开关**：每个节点卡片上都有一个“执行后需我确认（Require Approval）”的开关。
  - **高风险/终点节点**（如：发邮件、写库）：默认开启，执行完必须等用户点 `Approve`。
  - **低风险/中间节点**（如：搜索、格式化）：默认关闭，执行完自动流转。
- **干预操作保留**：在任何暂停状态下，用户都可以执行：
  - `Approve`（放行，进入下一节点）
  - `Edit`（直接在文本框里修改错误的数据，然后继续）
  - `Reject`（打回，输入指导意见让该节点重跑一次）

**US6: 工作流管理与极简执行 (Workflow Management & Run Trigger)**

- **工作流管理面板 (Dashboard)**：作为用户，我可以通过一个专属的 Dashboard 界面查看、管理和复用我保存的多个历史工作流。我可以在这里点击“新建工作流”进入画布，也可以点击已有的工作流进入编辑或直接触发执行。
- **动态入参弹窗**：作为用户，当我拼接好节点（如 `搜索` -> `总结`）并点击“Run Workflow”时，系统应该自动分析出“根节点”（如 `搜索` 节点）需要什么初始数据。此时系统应弹出一个简单的表单，让我输入这些初始值（如填写具体的 `query`），而不是在代码里写死。
- **自动保存与执行分离**：作为用户，我的操作符合直觉。系统提供“Save Workflow”（仅保存画布草稿到我的工作流列表中）和“Run Workflow”（如果有未保存的修改则自动触发保存，并弹出初始参数输入框后拉起执行）两个明确的动作。

US7: **Advanced Config (JSON)** 

- eg, generate image



US8: puppy agents

- choose different models(as your puppy)

