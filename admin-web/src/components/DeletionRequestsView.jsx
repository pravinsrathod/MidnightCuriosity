import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from "firebase/firestore";

/**
 * DeletionRequestsView Component: Manages permanent account removal requests.
 */
const DeletionRequestsView = ({ adminTenantId, handleRejectDeletion, handleApproveDeletion }) => {
  const [requests, setRequests] = useState([]);
  const [reqLoading, setReqLoading] = useState(true);

  useEffect(() => {
    if (!adminTenantId) return;
    const q = query(
      collection(db, "users"),
      where("tenantId", "==", adminTenantId),
      where("status", "==", "DELETION_PENDING")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setReqLoading(false);
    }, (err) => {
      console.error("Deletion fetch error:", err);
      setReqLoading(false);
    });
    return () => unsub();
  }, [adminTenantId]);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', borderColor: 'var(--danger-border)', background: 'rgba(239, 68, 68, 0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '8px', color: '#fca5a5' }}>Account Deletion Pipeline</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
              The following users have initiated a permanent account removal request.
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}> This action is irreversible</span> once approved.
            </p>
          </div>
        </div>
      </div>

      {reqLoading ? (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <div className="loader" style={{ margin: '0 auto' }}></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '24px' }}>🛡️</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Clear for Duty</h3>
          <p style={{ color: 'var(--text-secondary)' }}>You have no pending deletion requests at this time.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {requests.map(req => (
            <div key={req.id} className="card animate-scale-up" style={{ borderLeft: '4px solid var(--danger)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 800 }}>
                    {req.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{req.name || req.phoneNumber || req.email}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)', fontSize: '0.7rem' }}>{req.role?.toUpperCase()}</span>
                      <span style={{ margin: '0 8px', opacity: 0.3 }}>•</span>
                      Requested: {req.deletionRequestedAt ? new Date(req.deletionRequestedAt).toLocaleString() : 'Recently'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-ghost" onClick={() => handleRejectDeletion?.(req.id)}>Restore Account</button>
                  <button className="btn btn-danger" onClick={() => handleApproveDeletion?.(req.id)}>Confirm Deletion</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeletionRequestsView;
