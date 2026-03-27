import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { 
  ShieldAlert, 
  UserMinus, 
  RefreshCcw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Database,
  Lock,
  Search
} from 'lucide-react';

/**
 * IntegrityView Component: Superadmin tool to find and fix account inconsistencies.
 */
const IntegrityView = ({ customAlert, customConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [cleaningUid, setCleaningUid] = useState(null);

  const runAudit = async () => {
    setLoading(true);
    try {
      const getOrphanedUsers = httpsCallable(functions, 'getOrphanedUsers');
      const result = await getOrphanedUsers();
      setData(result.data);
      if (result.data.counts.orphans === 0 && result.data.counts.rejected === 0) {
        customAlert("System is clean! No orphans or rejected users found.", "Audit Complete");
      }
    } catch (error) {
      console.error("Audit failed:", error);
      customAlert("Failed to run audit: " + error.message, "Error");
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (user, type) => {
    const message = type === 'orphan' 
      ? `Permanently delete Auth record for orphan ${user.phoneNumber || user.email || user.uid}? This allows them to re-register.`
      : `Delete Auth record for REJECTED user ${user.name || user.phoneNumber || user.uid}? This allows them to re-register with a different institute.`;

    if (await customConfirm(message, "Confirm Deletion", true)) {
      setCleaningUid(user.uid);
      try {
        const deleteAuthUser = httpsCallable(functions, 'deleteAuthUser');
        await deleteAuthUser({ uid: user.uid });
        customAlert("User record deleted successfully.");
        // Refresh audit
        await runAudit();
      } catch (error) {
        console.error("Delete failed:", error);
        customAlert("Failed to delete user: " + error.message, "Error");
      } finally {
        setCleaningUid(null);
      }
    }
  };

  const bulkCleanupOrphans = async () => {
    if (!data?.orphans || data.orphans.length === 0) return;

    const count = data.orphans.length;
    if (await customConfirm(`This will delete ALL ${count} orphaned Auth records. Are you ABSOLUTELY sure? This cannot be undone.`, "BULK DELETE WARNING", true)) {
      setLoading(true);
      try {
        const deleteAuthUser = httpsCallable(functions, 'deleteAuthUser');
        let successCount = 0;
        
        // Sequential deletion to avoid hitting function limits/quota too hard at once, 
        // though Promise.all could be faster for small batches.
        for (const orphan of data.orphans) {
          try {
            await deleteAuthUser({ uid: orphan.uid });
            successCount++;
          } catch (err) {
            console.error(`Failed to delete orphan ${orphan.uid}:`, err);
          }
        }
        
        customAlert(`Bulk cleanup complete. Successfully deleted ${successCount} out of ${count} records.`);
        await runAudit();
      } catch (error) {
        customAlert("Bulk cleanup failed: " + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header Panel */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert color="var(--warning)" size={32} />
            Data Integrity & Cleanup
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Identify and remove orphaned Auth records to unblock user registrations.</p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={runAudit} 
          disabled={loading}
          style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {loading ? <RefreshCcw className="animate-spin" size={18} /> : <Search size={18} />}
          {data ? "Re-run Audit" : "Run System Audit"}
        </button>
      </div>

      {!data && !loading && (
        <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ padding: '24px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '50%', width: 'fit-content', margin: '0 auto 24px' }}>
            <Database size={48} color="var(--accent)" />
          </div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>No Audit Data Available</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
            Start a system audit to cross-reference Firebase Authentication with Firestore user profiles.
          </p>
        </div>
      )}

      {data && (
        <>
          {/* Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
            <StatCard label="Total Auth Users" value={data.counts.totalAuth} icon={<Lock size={20} color="var(--accent)" />} />
            <StatCard label="Firestore Profiles" value={data.counts.totalFirestore} icon={<Database size={20} color="var(--success)" />} />
            <StatCard label="Orphaned Records" value={data.counts.orphans} icon={<UserMinus size={20} color="var(--warning)" />} highlight={data.counts.orphans > 0} />
            <StatCard label="Rejected Profiles" value={data.counts.rejected} icon={<AlertCircle size={20} color="var(--danger)" />} highlight={data.counts.rejected > 0} />
          </div>

          {/* Rejected Users Section */}
          {data.rejected.length > 0 && (
            <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '40px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ padding: '20px 24px', background: 'rgba(239, 68, 68, 0.05)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertCircle size={18} /> Rejected Student Profiles
                </h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>STUDENT NAME</th>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PHONE NUMBER</th>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>INSTITUTE</th>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rejected.map(user => (
                      <tr key={user.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 24px' }}>{user.name || 'Unknown'}</td>
                        <td style={{ padding: '16px 24px' }}>{user.phoneNumber}</td>
                        <td style={{ padding: '16px 24px' }}><code style={{ fontSize: '0.8rem' }}>{user.tenantId}</code></td>
                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                          <button 
                            className="btn btn-ghost" 
                            style={{ color: 'var(--danger)' }} 
                            onClick={() => deleteUser(user, 'rejected')}
                            disabled={cleaningUid === user.uid}
                          >
                            {cleaningUid === user.uid ? <RefreshCcw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            <span style={{ marginLeft: '8px' }}>Delete Auth</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Orphans Section */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <UserMinus size={18} color="var(--warning)" /> Orphaned Auth Records
              </h3>
              {data.orphans.length > 0 && (
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: '0.85rem' }} onClick={bulkCleanupOrphans}>
                  Bulk Cleanup ({data.orphans.length})
                </button>
              )}
            </div>
            
            {data.orphans.length === 0 ? (
              <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CheckCircle2 color="var(--success)" size={40} style={{ marginBottom: '16px' }} />
                <p>No orphaned users detected.</p>
              </div>
            ) : (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'rgba(255,255,255,0.02)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>UID / ACCOUNT</th>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>CREATED</th>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>LAST LOGIN</th>
                      <th style={{ padding: '12px 24px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orphans.map(user => (
                      <tr key={user.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '16px 24px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.phoneNumber || user.email || 'No Identity'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{user.uid}</div>
                        </td>
                        <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>{user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}</td>
                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                          <button 
                            className="btn btn-ghost" 
                            style={{ color: 'var(--danger)' }} 
                            onClick={() => deleteUser(user, 'orphan')}
                            disabled={cleaningUid === user.uid}
                          >
                            {cleaningUid === user.uid ? <RefreshCcw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, icon, highlight }) => (
  <div className="card" style={{ padding: '24px', border: highlight ? '1px solid var(--warning)' : undefined }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>{icon}</div>
      {highlight && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)', boxShadow: '0 0 10px var(--warning)' }}></div>}
    </div>
    <div style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '4px' }}>{value}</div>
    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
  </div>
);

export default IntegrityView;
