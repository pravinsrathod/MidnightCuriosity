import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/**
 * PasswordResetRequestsView Component: Handles automated password resets for students.
 */
const PasswordResetRequestsView = ({ 
  adminTenantId, 
  tenantData = {}, 
  customConfirm, 
  customAlert, 
  customPrompt 
}) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resettingId, setResettingId] = useState(null);

  useEffect(() => {
    if (!adminTenantId) return;
    const q = query(
      collection(db, "password_reset_requests"),
      where("tenantId", "==", adminTenantId),
      where("status", "==", "PENDING"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Resets fetch error:", err);
      setLoading(false);
    });
    return () => unsub();
  }, [adminTenantId]);

  const handleMarkResetDone = async (requestId) => {
    if (await customConfirm("Mark this request as resolved?", "Resolved")) {
      try {
        await updateDoc(doc(db, "password_reset_requests", requestId), {
          status: 'RESOLVED',
          resolvedAt: serverTimestamp()
        });
        customAlert?.("Request marked as resolved.");
      } catch (e) {
        console.error(e);
        customAlert?.("Error updating request.");
      }
    }
  };

  const handleWhatsApp = async (req) => {
    if (resettingId) return;
    
    setResettingId(req.id);
    const editNumber = await customPrompt?.("Verify/Edit Mobile Number (including country code):", req.phoneNumber);
    if (!editNumber) {
      setResettingId(null);
      return;
    }
    const finalNumber = editNumber.replace(/[^0-9]/g, '');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let randomPass = '';
    for (let i = 0; i < 6; i++) {
      randomPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    try {
      const resetFn = httpsCallable(functions, 'adminResetPassword');
      await resetFn({
        phoneNumber: req.phoneNumber,
        newPassword: randomPass,
        tenantId: adminTenantId,
        requestId: req.id
      });

      const message = `Hello ${req.studentName}, your password for ${tenantData?.name || 'the institute'} has been reset to: ${randomPass}. You can now login.`;
      const url = `https://wa.me/${finalNumber}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
    } catch (e) {
      console.error("Reset Error:", e);
      customAlert?.(e.message || "Failed to reset password automatically. Please try manually.", "Reset Failed");
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', borderColor: 'var(--warning-border)', background: 'rgba(245, 158, 11, 0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ fontSize: '3rem' }}>🔑</div>
          <div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '8px', color: 'var(--warning)' }}>Password Reset Requests</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
              Automated password reset is now active. 
              <span style={{ fontWeight: 600 }}> Clicking WhatsApp will automatically reset the student's password</span> and open the chat.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <div className="loader" style={{ margin: '0 auto' }}></div>
        </div>
      ) : requests.length === 0 ? (
        <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '24px' }}>✅</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>All Caught Up</h3>
          <p style={{ color: 'var(--text-secondary)' }}>No pending password reset requests.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {requests.map(req => (
            <div key={req.id} className="card animate-scale-up" style={{ borderLeft: '4px solid var(--warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 800 }}>
                    {req.studentName?.charAt(0) || 'S'}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{req.studentName}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span className="badge" style={{ background: 'var(--bg-tertiary)', fontSize: '0.7rem' }}>{req.type || 'STUDENT'}</span>
                      <span style={{ margin: '0 8px', opacity: 0.3 }}>•</span>
                      {req.phoneNumber}
                      <span style={{ margin: '0 8px', opacity: 0.3 }}>•</span>
                      {req.createdAt ? new Date(req.createdAt.seconds * 1000).toLocaleString() : 'Just now'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button 
                    className="btn btn-ghost" 
                    onClick={() => handleWhatsApp(req)}
                    disabled={resettingId === req.id}
                  >
                    {resettingId === req.id ? 'Resetting...' : 'WhatsApp'}
                  </button>
                  <button className="btn btn-primary" onClick={() => handleMarkResetDone(req.id)}>Done</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PasswordResetRequestsView;
