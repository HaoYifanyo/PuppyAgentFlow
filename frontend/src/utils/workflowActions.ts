import axios from "axios";

// API Actions
export const saveWorkflowApi = async (
  workflowId: string | null,
  workflowName: string,
  nodes: any[],
  edges: any[],
  showAlert = true
) => {
  if (nodes.length === 0) {
    if (showAlert) alert("Cannot save an empty workflow.");
    return null;
  }

  try {
    const payload = {
      name: workflowName || `Custom Flow ${new Date().toLocaleTimeString()}`,
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.data?.node?.name || n.id,
        skill_id: n.data?.node?.skill_id,
        agent_id: n.data?.node?.agent_id,
        require_approval: n.data?.node?.require_approval ?? false,
        is_start_node: n.data?.node?.is_start_node ?? false,
        batch_mode: n.data?.node?.batch_mode ?? false,
        position: n.position,
        config: n.data?.node?.config || {},
        input_schema: n.data?.node?.input_schema,
        output_schema: n.data?.node?.output_schema,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        data_mapping: e.data_mapping || { "*": "*" },
      })),
    };

    if (workflowId) {
      const res = await axios.put(`/api/workflows/${workflowId}`, payload);
      if (showAlert) alert("Workflow saved successfully!");
      return res.data;
    } else {
      const res = await axios.post("/api/workflows", payload);
      if (showAlert) alert("Workflow created successfully!");
      return res.data;
    }
  } catch (err) {
    console.error(err);
    if (showAlert) alert("Failed to save workflow");
    return null;
  }
};
