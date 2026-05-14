import React, { useState, useEffect } from 'react';
import Pagination from './common/Pagination';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc,
  where,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Activity, 
  Smartphone, 
  Clock, 
  User, 
  ExternalLink, 
  CheckCircle, 
  Trash2,
  AlertTriangle,
  FileText,
  MessageSquare,
  Terminal,
  ChevronRight,
  Sparkles
} from 'lucide-react';

const SignalsView = ({ adminTenantId, customAlert, customConfirm }) => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let q;
    if (adminTenantId) {
      q = query(
        collection(db, 'signals'), 
        where('tenantId', '==', adminTenantId),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
    } else {
      q = query(
        collection(db, 'signals'), 
        orderBy('timestamp', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const signalList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSignals(signalList);
      setLoading(false);
      setCurrentPage(1); // Reset to first page on data refresh/tenant change
    }, (error) => {
      console.error("Error fetching signals:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [adminTenantId]); // Added adminTenantId to dependencies

  const resolveSignal = async (id) => {
    try {
      await updateDoc(doc(db, 'signals', id), {
        status: 'resolved',
        resolvedAt: new Date()
      });
      customAlert("Signal marked as resolved.");
    } catch (error) {
      customAlert("Failed to resolve signal: " + error.message);
    }
  };

  const deleteSignal = async (id) => {
    if (await customConfirm("Permanently delete this signal report?")) {
      try {
        await deleteDoc(doc(db, 'signals', id));
        customAlert("Signal deleted.");
        if (selectedSignal?.id === id) setSelectedSignal(null);
      } catch (error) {
        customAlert("Failed to delete signal: " + error.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 120px)' }}>
      {/* Left Column: List */}
      <div className="card" style={{ flex: selectedSignal ? '0 0 450px' : '1', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity color="var(--accent)" size={20} />
            Support Signals
            <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', borderRadius: '12px', marginLeft: '8px' }}>
              {signals.length} New
            </span>
          </h3>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {signals.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <CheckCircle size={40} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>No active signals. All systems nominal!</p>
            </div>
          ) : (
            signals.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(signal => (
              <div 
                key={signal.id} 
                className={`signal-item ${selectedSignal?.id === signal.id ? 'active' : ''}`}
                onClick={() => setSelectedSignal(signal)}
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: selectedSignal?.id === signal.id ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                  position: 'relative'
                }}
              >
                {signal.status !== 'resolved' && (
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--accent)' }} />
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} />
                    {signal.timestamp?.toDate ? signal.timestamp.toDate().toLocaleTimeString() : 'Just now'}
                  </span>
                  {signal.platform && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        background: signal.type === 'ticket' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.1)', 
                        color: signal.type === 'ticket' ? '#4ade80' : 'var(--accent)',
                        padding: '2px 8px', 
                        borderRadius: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}>
                        {signal.type || 'SIGNAL'}
                      </span>
                      <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                        {signal.platform.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                  {signal.userComment || "No comment provided"}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ExternalLink size={12} />
                    {signal.pathname}
                  </div>
                  {signal.tenantName && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500 }}>
                      {signal.tenantName}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        {signals.length > PAGE_SIZE && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
            <Pagination 
              currentPage={currentPage}
              totalItems={signals.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Right Column: Details */}
      {selectedSignal ? (
        <div className="card animate-slide-in" style={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px' }}>
                <Activity size={20} color="var(--accent)" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Signal Detail</h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {selectedSignal.id}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="btn btn-ghost" 
                style={{ color: 'var(--success)' }}
                onClick={() => resolveSignal(selectedSignal.id)}
              >
                <CheckCircle size={18} />
                <span style={{ marginLeft: '8px' }}>Resolve</span>
              </button>
              <button 
                className="btn btn-ghost" 
                style={{ color: 'var(--danger)' }}
                onClick={() => deleteSignal(selectedSignal.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            <Section title="User Feedback" icon={<MessageSquare size={16} />}>
              <div style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontStyle: 'italic', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                "{selectedSignal.userComment || "N/A"}"
              </div>
            </Section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <Section title="Source & Type" icon={<Activity size={16} />}>
                <DataRow label="Type" value={selectedSignal.type?.toUpperCase() || 'SIGNAL'} highlight />
                <DataRow label="Tenant Name" value={selectedSignal.tenantName} highlight />
                <DataRow label="Tenant ID" value={selectedSignal.tenantId} mono />
              </Section>
              <Section title="User Info" icon={<User size={16} />}>
                <DataRow label="Email" value={selectedSignal.userEmail} />
                <DataRow label="UID" value={selectedSignal.userId} mono />
              </Section>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <Section title="App Environment" icon={<Smartphone size={16} />}>
                <DataRow label="Version" value={selectedSignal.appVersion} />
                <DataRow label="Platform" value={selectedSignal.platform} />
                <DataRow label="Device" value={`${selectedSignal.deviceInfo?.brand} ${selectedSignal.deviceInfo?.modelName}`} />
              </Section>
            </div>

            <Section title="Context & Logs" icon={<Terminal size={16} />}>
              <div style={{ marginBottom: '16px' }}>
                <DataRow label="Screen Path" value={selectedSignal.pathname} highlight />
              </div>
              <div style={{ 
                background: '#0F172A', 
                color: '#94A3B8', 
                padding: '16px', 
                borderRadius: '8px', 
                fontFamily: 'monospace', 
                fontSize: '0.8rem',
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {selectedSignal.logs && selectedSignal.logs.length > 0 ? (
                  selectedSignal.logs.map((log, i) => (
                    <div key={i} style={{ marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px' }}>
                      {log}
                    </div>
                  ))
                ) : (
                  <div style={{ opacity: 0.5 }}>No technical logs captured for this signal.</div>
                )}
              </div>
            </Section>

            </div>
          </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
          <Activity size={80} />
          <p style={{ marginTop: '20px', fontSize: '1.2rem' }}>Select a signal to view details</p>
        </div>
      )}
    </div>
  );
};

const Section = ({ title, icon, children }) => (
  <div style={{ marginBottom: '32px' }}>
    <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {icon} {title}
    </h4>
    {children}
  </div>
);

const DataRow = ({ label, value, mono, highlight }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ 
      fontSize: '0.85rem', 
      color: highlight ? 'var(--accent)' : 'var(--text-primary)',
      fontWeight: highlight ? 600 : 400,
      fontFamily: mono ? 'monospace' : 'inherit'
    }}>{value || 'N/A'}</span>
  </div>
);

export default SignalsView;
