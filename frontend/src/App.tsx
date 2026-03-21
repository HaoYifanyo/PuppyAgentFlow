import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { ReactFlow, MiniMap, Controls, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { RunConfigModal } from './components/RunConfigModal';
import { WorkflowDashboardModal } from './components/WorkflowDashboardModal';
import { NodeConfigModal } from './components/NodeConfigModal';
import { RunHistoryModal } from './components/RunHistoryModal';
import { AgentLibraryModal } from './components/AgentLibraryModal';
import { ErrorToast } from './components/ErrorToast';
import type { NodeRunData, Agent } from './types/workflow';
import PuppyNode from './components/nodes/PuppyNode';
import StartNode from './components/nodes/StartNode';

import { useWorkflowState } from './hooks/useWorkflowState';
import { useWorkflowRun } from './hooks/useWorkflowRun';
import { useWorkflowDragDrop } from './hooks/useWorkflowDragDrop';
import { extractId } from './utils/id';

const nodeTypes = { puppyNode: PuppyNode, startNode: StartNode };

function App() {
  const [runHistoryOpen, setRunHistoryOpen] = useState(false);
  const [agentLibraryOpen, setAgentLibraryOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<{ _id?: string; id?: string; type: string; name: string; description: string; implementation: Record<string, any> }[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await axios.get('/api/agents');
      setAgents(res.data);
    } catch {
      // non-critical
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await axios.get('/api/skills');
      setSkills(res.data);
    } catch {
      // non-critical
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchSkills();
  }, [fetchAgents, fetchSkills]);

  const {
    nodes, setNodes, onNodesChange,
    edges, setEdges, onEdgesChange,
    workflowId, setWorkflowId,
    workflowName, setWorkflowName,
    dashboardOpen, setDashboardOpen,
    reactFlowWrapper,
    reactFlowInstance, setReactFlowInstance,
    editingNode, setEditingNode,
    handleEditNodeClick,
    handleSaveNodeConfig,
    handleDeleteNode,
    handleLoadWorkflow
  } = useWorkflowState();

  const {
    setRunId,
    runStatus, setRunStatus,
    setIsPolling,
    runConfigOpen, setRunConfigOpen,
    rootNodeData,
    executeRun,
    handleResume,
    prepareRun,
    saveWorkflow,
    error: runError,
    setError: setRunError,
  } = useWorkflowRun(
    workflowId, setWorkflowId,
    workflowName, setWorkflowName,
    nodes, setNodes,
    edges, setEdges
  );

  const { onDragOver, onDrop, onConnect } = useWorkflowDragDrop(
    nodes, setNodes, setEdges,
    reactFlowInstance, handleEditNodeClick, handleResume
  );

  // Sync latest closures to node data
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, onResume: handleResume, onEditClick: handleEditNodeClick }
    })));
  }, [handleResume, handleEditNodeClick, setNodes]);

  const handleCreateNewFlow = async () => {
    if (nodes.length > 0) {
      const saved = await saveWorkflow(false);
      if (!saved) return;
    }
    setWorkflowId(null);
    setWorkflowName(`Custom Flow ${new Date().toLocaleTimeString()}`);
    setRunId(null);
    setRunStatus('idle');
    setIsPolling(false);
    setNodes([]);
    setEdges([]);
  };

  const createNewWorkflow = () => {
    if (window.confirm("Are you sure you want to clear the canvas? Any unsaved changes will be lost.")) {
      setWorkflowId(null);
      setWorkflowName(`Custom Flow ${new Date().toLocaleTimeString()}`);
      setRunId(null);
      setRunStatus('idle');
      setIsPolling(false);
      setNodes([]);
      setEdges([]);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col font-sans bg-gray-50">
      <ErrorToast message={runError} onDismiss={() => setRunError(null)} />
      <Navbar
        workflowName={workflowName}
        setWorkflowName={setWorkflowName}
        runStatus={runStatus}
        nodesLength={nodes.length}
        workflowId={workflowId}
        onOpenDashboard={() => setDashboardOpen(true)}
        onOpenRunHistory={() => setRunHistoryOpen(true)}
        onSaveWorkflow={saveWorkflow}
        onCreateNewFlow={handleCreateNewFlow}
        onClearCanvas={createNewWorkflow}
        onPrepareRun={prepareRun}
        onOpenAgentLibrary={() => setAgentLibraryOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar skills={skills} loading={skillsLoading} fetchSkills={fetchSkills} />

        <div className="flex-1 w-full h-full relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50"
          >
            <Background color="#ccc" gap={16} />
            <Controls />
            <MiniMap zoomable pannable nodeClassName={(n) => {
              const status = (n.data?.runData as NodeRunData)?.status;
              if (status === 'paused') return '#fbbf24';
              if (status === 'completed') return '#4ade80';
              if (status === 'error') return '#f87171';
              if (status === 'running') return '#60a5fa';
              return '#d1d5db';
            }} />
          </ReactFlow>
        </div>
      </div>

      <WorkflowDashboardModal
        isOpen={dashboardOpen}
        onClose={() => setDashboardOpen(false)}
        onLoad={(wf) => handleLoadWorkflow(wf, handleResume)}
      />

      <RunConfigModal
        isOpen={runConfigOpen}
        onClose={() => setRunConfigOpen(false)}
        onStart={executeRun}
        rootNode={rootNodeData}
      />

      <NodeConfigModal
        isOpen={!!editingNode}
        onClose={() => setEditingNode(null)}
        onSave={handleSaveNodeConfig}
        onDelete={handleDeleteNode}
        node={editingNode}
        agents={agents}
        skillType={editingNode ? (skills.find(s => extractId(s._id || s.id) === editingNode.skill_id)?.type) : undefined}
      />

      <AgentLibraryModal
        isOpen={agentLibraryOpen}
        onClose={() => setAgentLibraryOpen(false)}
        onAgentsChange={fetchAgents}
      />

      <RunHistoryModal
        isOpen={runHistoryOpen}
        onClose={() => setRunHistoryOpen(false)}
        workflowId={workflowId}
      />
    </div>
  );
}

export default App;