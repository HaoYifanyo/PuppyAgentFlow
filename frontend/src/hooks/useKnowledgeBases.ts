import { useState, useCallback } from "react";
import axios from "axios";
import type {
  KnowledgeBase,
  KBDocument,
  KBSearchResult,
  KBCreate,
  KBUpdate,
} from "../types/knowledgeBase";
import { extractId } from "../utils/id";

export function useKnowledgeBases() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKnowledgeBases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/knowledge-bases");
      setKnowledgeBases(res.data);
    } catch {
      setError("Failed to load knowledge bases");
    } finally {
      setLoading(false);
    }
  }, []);

  const createKnowledgeBase = useCallback(async (data: KBCreate) => {
    try {
      const res = await axios.post("/api/knowledge-bases", data);
      setKnowledgeBases((prev) => [...prev, res.data]);
      setError(null);
      return res.data as KnowledgeBase;
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to create knowledge base");
      return null;
    }
  }, []);

  const updateKnowledgeBase = useCallback(
    async (kbId: string, data: KBUpdate) => {
      try {
        const res = await axios.put(`/api/knowledge-bases/${kbId}`, data);
        setKnowledgeBases((prev) =>
          prev.map((kb) =>
            extractId(kb._id || kb.id) === kbId ? res.data : kb
          )
        );
        setError(null);
        return res.data as KnowledgeBase;
      } catch (e: any) {
        setError(
          e?.response?.data?.detail || "Failed to update knowledge base"
        );
        return null;
      }
    },
    []
  );

  const deleteKnowledgeBase = useCallback(async (kbId: string) => {
    try {
      await axios.delete(`/api/knowledge-bases/${kbId}`);
      setKnowledgeBases((prev) =>
        prev.filter((kb) => extractId(kb._id || kb.id) !== kbId)
      );
      setDocuments([]);
      setSearchResults([]);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete knowledge base");
    }
  }, []);

  const fetchDocuments = useCallback(async (kbId: string) => {
    try {
      const res = await axios.get(`/api/knowledge-bases/${kbId}/documents`);
      setDocuments(res.data);
    } catch {
      setError("Failed to load documents");
    }
  }, []);

  const uploadDocuments = useCallback(
    async (kbId: string, files: FileList) => {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      try {
        const res = await axios.post(
          `/api/knowledge-bases/${kbId}/documents`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        setError(null);
        return res.data;
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to upload documents");
        return null;
      }
    },
    []
  );

  const deleteDocument = useCallback(
    async (kbId: string, docId: string) => {
      try {
        await axios.delete(`/api/knowledge-bases/${kbId}/documents/${docId}`);
        setDocuments((prev) =>
          prev.filter((d) => extractId(d._id || d.id) !== docId)
        );
        setError(null);
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to delete document");
      }
    },
    []
  );

  const searchKnowledgeBase = useCallback(
    async (kbId: string, query: string, topK: number = 5) => {
      try {
        const res = await axios.post(`/api/knowledge-bases/${kbId}/search`, {
          query,
          top_k: topK,
        });
        setSearchResults(res.data.results);
        setError(null);
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Search failed");
      }
    },
    []
  );

  return {
    knowledgeBases,
    documents,
    searchResults,
    loading,
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
  };
}
