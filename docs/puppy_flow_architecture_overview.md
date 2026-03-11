# PuppyFlow Architecture Overview (Demo Version)

## Core Tech Stack (The Puppy Stack)

* **Python (FastAPI)**: Serves as the backend foundation, providing modern type safety and high-performance asynchronous processing. For the Demo phase, it utilizes RESTful APIs, opting against complex solutions like GraphQL.
* **React + React Flow**: The frontend solution. React Flow is used to build a minimalist visual node editor, utilizing standard Fetch/Axios for client-server communication.
* **MongoDB + Beanie ODM + Pydantic**: The database layer. MongoDB’s flexible schema is a perfect fit for dynamic node data structures; Pydantic handles data validation, and Beanie provides the asynchronous ODM mapping.

## Core Architectural Principles

1. **Lightweight & Decoupled**: Centered around a state machine; the frontend is responsible for rendering and status polling, while the backend manages the flow logic.
2. **State Persistence**: Introduces a `Paused` state to accommodate Human-in-the-Loop (HITL) breakpoint review requirements.

## Engine & Execution

### 1. State Machine Transitions & Breakpoint Resume (DAG & Resume)

* **Topological Sort Driven**: Workflows are treated as Directed Acyclic Graphs (DAG). Instead of a simple linear `for` loop, the engine calculates "executable nodes" in real-time based on topological sorting. This lays the groundwork for supporting Map-Reduce (parallel execution) and branching logic.
* **State Persistence (Suspension)**: When a node finishes execution and `require_approval` is set to true, the engine sets the workflow instance status to `PAUSED`. **Crucially, the engine process then exits**, releasing server resources instead of idling.
* **Precise Resume**: Once a user completes a review (Approve/Edit) via the UI, a specialized Resume API is called. The backend reloads the workflow state, updates the node data, marks it as `COMPLETED`, and **re-triggers the engine** to perform the next topological calculation and continue the flow.

### 2. Data Mapping

* Data is not simply passed through between nodes. Strict data mapping rules (e.g., `{"B.target_link": "A.url"}`) are defined on the workflow edges. This ensures that upstream outputs are accurately transformed into the specific input format required by downstream nodes.

### 3. LLM Node Assembly (The Puppy Node)

Each LLM node ("Puppy") is assembled into a strict three-layer structure during execution to ensure single responsibility and structured output:

1. **System Prompt Layer (Role Definition)**: Injects the node's role and unique task description (`Skill.description`), emphasizing the principle of node isolation.
2. **User Input Layer (Data Injection)**: Injects data from upstream nodes (post-mapping) using explicit delimiters (e.g., `<input_data>`) to prevent prompt injection.
3. **Output Control Layer (Enforced Structure)**: Converts the node’s `output_schema` into a hard constraint (via prompt instructions and JSON Mode / Tool Calling). This forces the LLM to output strictly compliant JSON. Post-execution, the data must pass `Pydantic` or `jsonschema` validation; otherwise, it triggers an `Error` state or a retry mechanism.

---

## Key Files (Execution Context)

* `puppy_flow_demo_prd.md`: Product requirements and core User Stories.
* `puppy_flow_database_schema.md`: Database structure definitions.
* `engine.py` : The core implementation of the workflow state machine.

<br/>

---

---

<br/>

## 核心技术栈 (The Puppy Stack)

*   **Python (FastAPI)**: 作为后端基础，提供现代化的类型安全机制和高性能异步处理能力。Demo 阶段采用 RESTful 接口，暂不引入 GraphQL 等复杂方案。
*   **React + React Flow**: 前端方案。React Flow 用于构建极简可视化节点编辑器，基础 Fetch/Axios 进行前后端通信。
*   **MongoDB + Beanie ODM + Pydantic**: 数据库层。MongoDB 的灵活 Schema 极度契合动态节点数据结构；Pydantic 负责数据验证；Beanie 提供异步映射。

## 核心架构原则
1. **轻量与解耦**：以状态机为核心，前端只负责绘制与状态轮询，后端负责流转逻辑。
2. **状态驻留**：引入 `Paused` 状态应对人类在环（Human-in-the-Loop）断点审查需求。

## 引擎与执行机制 (Engine & Execution)

### 1. 状态机流转与断点唤醒 (DAG & Resume)
*   **拓扑排序驱动**：工作流是一个有向无环图 (DAG)。引擎不使用简单的线性 `for` 循环，而是基于拓扑排序实时计算“当前有哪些节点可以执行”。这为后续支持 Map-Reduce（并发执行多个相同节点）和分支逻辑奠定了基础。
*   **状态驻留 (挂起)**：当节点执行完毕且 `require_approval` 为 true 时，引擎将工作流实例状态置为 `PAUSED`，**随后引擎进程直接退出**，不占用服务器资源等待。
*   **精准唤醒 (Resume)**：用户在前端完成审查（Approve/Edit）后，调用专门的 Resume API。后端重新加载该工作流状态，更新节点数据并将其置为 `COMPLETED`，随后**重新启动引擎**进行下一次拓扑计算，继续流转。

### 2. 数据映射 (Data Mapping)
*   节点间的数据并非透传。在工作流的边（Edges）上定义了严格的数据映射规则（如 `{"B.target_link": "A.url"}`），确保上游节点的输出能够精准转换为下游节点所需的输入格式。

### 3. LLM 节点组装 (The Puppy Node)
每个 LLM 节点（“小狗”）在执行时，会被组装为严格的三层结构，以确保单一职责和结构化输出：
1.  **System Prompt 层 (职责界定)**：注入节点的角色设定和唯一任务描述（Skill.description），强调节点隔离原则。
2.  **User Input 层 (数据注入)**：将上游传入的数据（经过 Data Mapping）使用明确的分隔符（如 `<input_data>`）注入，防止指令注入。
3.  **Output Control 层 (强制结构化)**：将节点定义的 `output_schema` 转化为强约束（通过 Prompt 指令和 JSON Mode / Tool Calling），强制 LLM 输出严格符合 Schema 的 JSON 数据。执行后必须通过 `Pydantic` 或 `jsonschema` 校验，失败则进入 Error 状态或触发重试。

## 关键文件 (执行上下文)

*   `puppy_flow_demo_prd.md`: 产品需求与核心 User Story。
*   `puppy_flow_database_schema.md`: 数据库结构定义。
*   `engine.py` : 核心工作流状态机实现。