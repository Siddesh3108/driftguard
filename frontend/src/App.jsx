import React, { useState, useEffect, useCallback } from "react";
import Sidebar  from "./components/Sidebar.jsx";
import TopBar   from "./components/TopBar.jsx";
import Overview      from "./pages/Overview.jsx";
import DriftMonitor  from "./pages/DriftMonitor.jsx";
import Performance   from "./pages/Performance.jsx";
import Analytics     from "./pages/Analytics.jsx";
import DataQuality   from "./pages/DataQuality.jsx";
import StreamMonitor from "./pages/StreamMonitor.jsx";
import ModelRegistry from "./pages/ModelRegistry.jsx";
import AuditLog      from "./pages/AuditLog.jsx";
import TryIt         from "./pages/TryIt.jsx";
import Settings      from "./pages/Settings.jsx";
import { api }       from "./api/client.js";

const PAGE_MAP = {
  overview:    Overview,
  drift:       DriftMonitor,
  performance: Performance,
  analytics:   Analytics,
  quality:     DataQuality,
  stream:      StreamMonitor,
  registry:    ModelRegistry,
  audit:       AuditLog,
  predict:     TryIt,
  settings:    Settings,
};

export default function App() {
  const [page,          setPage]          = useState("overview");
  const [models,        setModels]        = useState([]);
  const [selectedModel, setSelectedModel] = useState("churn_model");
  const [systemStatus,  setSystemStatus]  = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [refreshKey,    setRefreshKey]    = useState(0);

  // Load model list once
  useEffect(() => {
    api.models().then(m => {
      setModels(m);
      if (m.length > 0 && !m.find(x => x.id === selectedModel)) {
        setSelectedModel(m[0].id);
      }
    });
  }, []);

  // Load system status whenever model or refresh changes
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.systemStatus();
      setSystemStatus(s);
    } finally {
      setLoading(false);
    }
  }, [selectedModel]);

  useEffect(() => {
    loadStatus();
  }, [selectedModel, refreshKey, loadStatus]);

  // Auto-refresh system status every 30 seconds
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const PageComponent = PAGE_MAP[page] || Overview;

  return (
    <div className="flex h-screen bg-[#0a0f1e] text-slate-100 overflow-hidden">
      <Sidebar page={page} setPage={setPage} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          models={models}
          selectedModel={selectedModel}
          setSelectedModel={(m) => { setSelectedModel(m); setRefreshKey(k => k + 1); }}
          systemStatus={systemStatus}
          onRefresh={() => setRefreshKey(k => k + 1)}
          loading={loading}
        />

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <PageComponent
            key={`${page}-${selectedModel}`}
            model={selectedModel}
          />
        </main>
      </div>
    </div>
  );
}
