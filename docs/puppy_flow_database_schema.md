# PuppyFlow Database Design (Demo Version)

Based on the Demo PRD (emphasizing workflow orchestration, node-level context isolation, and breakpoint reviews), we utilize **MongoDB** with **Beanie ODM**.

The core logic lies in separating "Workflow Definitions" from "Workflow Runs," while maintaining "Skills" as the foundational templates for nodes.

## 1. Skills Collection (AI Skill Library)

A library of built-in or user-defined node templates used to generate nodes via drag-and-drop in the UI.

* **`name`**: Skill name (e.g., "Google Search", "Summarizer").
* **`type`**: Node type (`tool` or `llm`).
* **`description`**: Detailed description for user understanding and system routing.
* **`input_schema` / `output_schema**`: JSON Schema definitions.
> **Note**: These act as the node's "specification," defining exactly which fields must be received and output. The frontend uses these to auto-render input forms, and the backend uses them for data validation.


* **`implementation`**: Dynamic execution configuration. To avoid hard-coding backend functions, we use a universal executor pattern to support highly dynamic Agent systems:
* **If `type` is `llm**`:
* `prompt_template`: Markdown-formatted instructions (similar to `SKILL.md`), using `{{variable}}` syntax to inject input variables.


* **If `type` is `tool**`:
* `executor`: The type of universal executor (e.g., `http_request` or `python_eval`).
* `config`: Corresponding executor configuration (e.g., API URL, headers, or dynamic Python code snippets).





## 2. Workflows Collection (Static Topology)

The Directed Acyclic Graph (DAG) orchestrated by the user.

* **`name`**: Workflow name.
* **`description`**: Business use-case description.
* **`nodes`**: A list of node objects:
* `id`: Unique identifier for the node.
* `name`: Display name.
* `skill_id`: Reference to `Skills._id`.
* `require_approval`: Boolean; determines if the workflow pauses for manual review after this node executes.
* `config`: Static node configuration (e.g., node-specific prompts or fixed parameters).


* **`edges`**: A list of edge objects:
* `source`: Source node ID.
* `target`: Target node ID.
* `data_mapping`: Rules for data transformation (mapping upstream `outputs` to downstream `input_keys`).



## 3. WorkflowRuns Collection (Execution Instances)

A record generated every time "Run" is clicked, responsible for carrying context and interrupt states.

* **`workflow_id`**: Reference to `Workflows._id`.
* **`status`**: Overall status (`pending`, `running`, `paused`, `completed`, `error`).
* **`global_context`**: A dictionary storing the outputs of all completed nodes.
* **`node_runs`**: An array of objects tracking the real-time status of each node:
* `node_id`: The corresponding node ID from the workflow definition.
* `status`: Node-specific status (`pending`, `running`, `paused`, `completed`, `error`).
* `inputs`: A snapshot of the actual data loaded into the node.
* `outputs`: A snapshot of the data produced after execution.
* `error_msg`: Error details (if applicable).



---

## Architectural Trade-offs & Advantages

1. **Eliminating "State Drift"**: Execution flow relies on explicit state records in `WorkflowRuns` rather than the LLM's native (and often messy) chat history. `inputs` and `outputs` are strictly isolated.
2. **Seamless Human-in-the-Loop (HITL)**: If a node finishes and `require_approval` is true, both the node and the workflow status transition to `paused`. The frontend fetches the `outputs` for user review. Once the user clicks Approve/Edit, the `outputs` are updated, and the status is set back to `completed` to trigger the next node.
3. **NoSQL Nesting Advantage**: By nesting Nodes/Edges within the Workflow and NodeRuns within the WorkflowRun, we avoid the complex JOIN operations typical of relational databases, keeping lookups fast and atomic.

<br/>

---

---

<br/>




# PuppyFlow 数据库设计 (Demo 版)

基于 Demo 版的 PRD（强调工作流编排、节点级上下文隔离和断点审查），我们采用 MongoDB + Beanie ODM。

核心在于将“工作流定义 (Workflow)” 与 “执行实例 (WorkflowRun)” 分离，同时保留“技能 (Skills)”作为节点的基础模版。

## 1. Skills 集合 (AI 技能模版库)

系统内置或用户保存的节点功能模版。用于在 UI 上拖拽生成 Node。

- `name`: 技能名称 (如: "谷歌搜索", "提取摘要")
- `type`: 节点类型 (`tool` 或 `llm`)
- `description`: 详细描述，供用户理解和系统路由。
- `input_schema` / `output_schema`: JSON Schema 定义。**（注：充当节点的“说明书”，定义该节点必须接收什么字段、必须输出什么字段。前端据此自动渲染输入表单，后端据此做数据校验。）**
- `implementation`: 节点的动态执行配置。不再硬编码后端函数名，而是采用通用执行器模式，以支持高度动态的 Agent 系统：
  - 若 `type` 为 `llm`:
    - `prompt_template`: Markdown 格式的指令（类似 `SKILL.md`），使用 `{{variable}}` 语法注入输入变量。
  - 若 `type` 为 `tool`:
    - `executor`: 通用执行器类型（如 `http_request` 或 `python_eval`）。
    - `config`: 对应的执行器配置（如 API URL、请求头，或动态 Python 代码段）。

## 2. Workflows 集合 (工作流拓扑定义)

用户编排的静态工作流图（DAG）。

- `name`: 工作流名称。
- `description`: 业务场景描述。
- `nodes`: 节点列表 (Array of Objects)
  - `id`: 节点唯一标识。
  - `name`: 节点展示名。
  - `skill_id`: 关联的 `Skills._id`。
  - `require_approval`: boolean，是否开启断点审查（执行后挂起等待）。
  - `config`: 节点静态配置（如专属 Prompt、固定参数）。
- `edges`: 边列表 (Array of Objects)
  - `source`: 源节点 ID。
  - `target`: 目标节点 ID。
  - `data_mapping`: 数据映射规则（将上游的 output 映射为下游的 input_keys）。

## 3. WorkflowRuns 集合 (工作流执行实例)

每一次点击“运行”产生的一条记录，负责承载上下文和中断状态。

- `workflow_id`: 关联 `Workflows._id`。
- `status`: 整体状态 (`pending`, `running`, `paused`, `completed`, `error`)。
- `global_context`: 全局上下文状态字典 (Dict)，存储各节点执行完毕后的 Output。
- `node_runs`: 节点执行记录 (Array of Objects)，记录每个节点的实时状态：
  - `node_id`: 对应的节点 ID。
  - `status`: 该节点状态 (`pending`, `running`, `paused`, `completed`, `error`)。
  - `inputs`: 实际装载的输入数据快照。
  - `outputs`: 执行完成后的输出数据快照。
  - `error_msg`: 错误信息（如有）。

## 架构权衡与设计优势

1. **彻底解决状态漂移**：执行流转依赖 `WorkflowRuns` 的明确状态记录，而不是 LLM 原生的多轮对话历史。`inputs` 与 `outputs` 严格隔离。
2. **完美支持断点审查 (Human-in-the-Loop)**：当节点跑完且 `require_approval` 为 true 时，该节点的 `status` 及整体 `status` 变为 `paused`。此时前端拉取 `outputs` 展示给用户，用户点击 Approve/Edit 后更新 `outputs`，并将状态改回 `completed` 以驱动下一个节点。
3. **NoSQL 嵌套优势**：将 Nodes/Edges 嵌套在 Workflow 中，NodeRuns 嵌套在 WorkflowRun 中，避免传统关系型数据库复杂的 Join。
