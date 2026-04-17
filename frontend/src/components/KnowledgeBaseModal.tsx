import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
} from "lucide-react";
import type { Agent } from "../types/workflow";
import type { KnowledgeBase } from "../types/knowledgeBase";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input, Label } from "./ui/Input";
import { extractId } from "../utils/id";
import { useKnowledgeBases } from "../hooks/useKnowledgeBases";

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
}

const FILE_ACCEPT = ".pdf,.txt,.md,.csv,.html";

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    ready: {
      bg: "bg-green-50 border-green-200",
      text: "text-green-700",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    processing: {
      bg: "bg-amber-50 border-amber-200",
      text: "text-amber-700",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    error: {
      bg: "bg-red-50 border-red-200",
      text: "text-red-700",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    pending: {
      bg: "bg-stone-50 border-stone-200",
      text: "text-stone-500",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md border ${c.bg} ${c.text}`}>
      {c.icon} {status}
    </span>
  );
};

export const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({
  isOpen,
  onClose,
  agents,
}) => {
  const {
    knowledgeBases,
    documents,
    searchResults,
    error,
    setError,
    fetchKnowledgeBases,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    fetchDocuments,
    uploadDocuments,
    deleteDocument,
    searchKnowledgeBase,
    setSearchResults,
  } = useKnowledgeBases();

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteKb, setConfirmDeleteKb] = useState(false);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchKnowledgeBases();
      setSelectedKbId(null);
      setIsNew(false);
      setError(null);
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedKbId) {
      fetchDocuments(selectedKbId);
      setSearchResults([]);
      setSearchQuery("");
    }
  }, [selectedKbId]);

  // Poll documents while any are processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing" || d.status === "pending");
    if (!hasProcessing || !selectedKbId) return;
    const timer = setInterval(() => {
      fetchDocuments(selectedKbId);
      fetchKnowledgeBases();
    }, 3000);
    return () => clearInterval(timer);
  }, [documents, selectedKbId]);

  const handleSelectKb = (kb: KnowledgeBase) => {
    const id = extractId(kb._id || kb.id);
    setSelectedKbId(id);
    setIsNew(false);
    setFormName(kb.name);
    setFormDescription(kb.description);
    setFormAgentId(kb.embedding_agent_id);
    setError(null);
    setConfirmDeleteKb(false);
    setSaveSuccess(false);
  };

  const handleNew = () => {
    setSelectedKbId(null);
    setIsNew(true);
    setFormName("");
    setFormDescription("");
    setFormAgentId(agents[0] ? extractId(agents[0]._id || agents[0].id) || "" : "");
    setError(null);
    setConfirmDeleteKb(false);
    setSaveSuccess(false);
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError("Name is required");
      return;
    }
    if (!formAgentId) {
      setError("Embedding agent is required");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      if (isNew) {
        const kb = await createKnowledgeBase({
          name: formName.trim(),
          description: formDescription.trim(),
          embedding_agent_id: formAgentId,
        });
        if (kb) {
          setIsNew(false);
          setSelectedKbId(extractId(kb._id || kb.id));
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } else if (selectedKbId) {
        await updateKnowledgeBase(selectedKbId, {
          name: formName.trim(),
          description: formDescription.trim(),
          embedding_agent_id: formAgentId,
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedKbId) return;
    setUploading(true);
    setError(null);
    await uploadDocuments(selectedKbId, files);
    await fetchDocuments(selectedKbId);
    await fetchKnowledgeBases();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedKbId) return;
    await deleteDocument(selectedKbId, docId);
    await fetchKnowledgeBases();
    setConfirmDeleteDocId(null);
  };

  const handleDeleteKb = async () => {
    if (!selectedKbId) return;
    await deleteKnowledgeBase(selectedKbId);
    setSelectedKbId(null);
    setIsNew(false);
    setConfirmDeleteKb(false);
  };

  const handleSearch = async () => {
    if (!selectedKbId || !searchQuery.trim()) return;
    await searchKnowledgeBase(selectedKbId, searchQuery.trim());
  };

  if (!isOpen) return null;

  const hasForm = isNew || selectedKbId !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container width="w-[800px]">
        <Modal.Header
          title={
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg text-stone-800">Knowledge Bases</span>
                <span className="text-[10px] text-stone-500">Manage documents for RAG retrieval</span>
              </div>
            </div>
          }
          icon={null}
          onClose={onClose}
          closeTestId="kb-modal-close"
        />

        <div className="flex h-[620px] overflow-hidden rounded-b-2xl">
          {/* Left: KB list */}
          <div className="w-56 border-r border-indigo-100 flex flex-col bg-indigo-50/20">
            <div className="p-3 border-b border-indigo-100">
              <Button className="w-full" onClick={handleNew} icon={<Plus className="w-3.5 h-3.5" />}>
                New Knowledge Base
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {knowledgeBases.length === 0 && (
                <p className="text-[11px] text-stone-400 text-center mt-4 px-2">
                  No knowledge bases yet. Create one to upload documents.
                </p>
              )}
              {knowledgeBases.map((kb) => {
                const id = extractId(kb._id || kb.id);
                const isSelected = selectedKbId === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelectKb(kb)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-400/20"
                        : "bg-transparent border-transparent hover:bg-white hover:border-indigo-100"
                    }`}
                  >
                    <div className="font-semibold text-xs text-stone-800 truncate">{kb.name}</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">
                      {kb.document_count} doc{kb.document_count !== 1 ? "s" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Detail */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {!hasForm ? (
              <div className="flex-1 flex items-center justify-center text-sm text-stone-400">
                Select a knowledge base or create a new one
              </div>
            ) : (
              <>
                <Modal.Body className="flex-1 overflow-y-auto">
                  {/* KB form fields */}
                  <div className="space-y-1">
                    <Label>Name <span className="text-rose-500">*</span></Label>
                    <Input data-testid="kb-name-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Product Docs" />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Input data-testid="kb-description-input" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" />
                  </div>
                  <div className="space-y-1">
                    <Label>Embedding Agent <span className="text-rose-500">*</span></Label>
                    <select
                      value={formAgentId}
                      data-testid="kb-agent-select"
                      onChange={(e) => setFormAgentId(e.target.value)}
                      className="w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
                    >
                      <option value="">Select an agent...</option>
                      {agents.map((a) => {
                        const aid = extractId(a._id || a.id);
                        return (
                          <option key={aid} value={aid}>
                            {a.name} ({a.provider} / {a.model_id})
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[10px] text-stone-400">
                      Choose an agent configured with an embedding model (e.g. text-embedding-3-small)
                    </p>
                  </div>

                  {/* Documents section - only for saved KBs */}
                  {selectedKbId && !isNew && (
                    <>
                      <div className="border-t border-stone-100 pt-4 mt-2">
                        <div className="flex items-center justify-between mb-3">
                          <Label>Documents</Label>
                          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl cursor-pointer transition-colors ${uploading ? "bg-stone-100 text-stone-400" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {uploading ? "Uploading..." : "Upload"}
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              accept={FILE_ACCEPT}
                              onChange={handleUpload}
                              disabled={uploading}
                              className="hidden"
                              aria-label="Upload documents"
                            />
                          </label>
                        </div>

                        {documents.length === 0 ? (
                          <p className="text-[11px] text-stone-400 text-center py-4">
                            No documents yet. Upload PDF, TXT, MD, CSV, or HTML files.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {documents.map((doc) => {
                              const docId = extractId(doc._id || doc.id);
                              return (
                                <div key={docId} className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-100">
                                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-stone-700 truncate">{doc.filename}</div>
                                    <div className="text-[10px] text-stone-400">
                                      {doc.chunk_count} chunks &middot; {(doc.file_size / 1024).toFixed(1)}KB
                                    </div>
                                  </div>
                                  <StatusBadge status={doc.status} />
                                  {confirmDeleteDocId === docId ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => setConfirmDeleteDocId(null)} className="text-[10px] text-stone-400 hover:text-stone-600 cursor-pointer">Cancel</button>
                                      <button onClick={() => handleDeleteDoc(docId!)} className="text-[10px] text-red-500 hover:text-red-700 font-medium cursor-pointer">Delete</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setConfirmDeleteDocId(docId!)} className="text-stone-300 hover:text-red-500 transition-colors cursor-pointer" title="Delete document">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Search test */}
                      <div className="border-t border-stone-100 pt-4 mt-2">
                        <Label>Search Test</Label>
                        <div className="flex gap-2 mt-1.5">
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Enter a query to test retrieval..."
                            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                          />
                          <Button variant="secondary" size="sm" onClick={handleSearch} icon={<Search className="w-3.5 h-3.5" />}>
                            Search
                          </Button>
                        </div>
                        {searchResults.length > 0 && (
                          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                            {searchResults.map((r, i) => (
                              <div key={i} className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-medium text-indigo-600">{r.filename}</span>
                                  <span className="text-[10px] font-mono text-stone-500">score: {r.score.toFixed(3)}</span>
                                </div>
                                <p className="text-xs text-stone-600 line-clamp-3">{r.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {error && (
                    <p className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded-xl border border-red-100">
                      {error}
                    </p>
                  )}
                </Modal.Body>

                <Modal.Footer>
                  {selectedKbId && !isNew ? (
                    confirmDeleteKb ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-600 font-medium">Delete this knowledge base?</span>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteKb(false)}>Cancel</Button>
                        <Button data-testid="kb-delete-confirm" variant="danger" size="sm" onClick={handleDeleteKb}>Confirm</Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        data-testid="kb-delete-btn"
                        onClick={() => setConfirmDeleteKb(true)}
                        icon={<Trash2 className="w-4 h-4" />}
                      >
                        Delete
                      </Button>
                    )
                  ) : (
                    <div />
                  )}
                  <div className="flex items-center gap-3">
                    {saveSuccess && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md">
                        Saved
                      </span>
                    )}
                    <Button data-testid="kb-save-btn" variant="primary" onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </Modal.Footer>
              </>
            )}
          </div>
        </div>
      </Modal.Container>
    </Modal>
  );
};
