import React from 'react';
import { doc, updateDoc } from "firebase/firestore";

/**
 * SuperAdminView Component: Global control panel for all institutes.
 */
const SuperAdminView = ({ 
  allTenants = [], 
  handleApproveTenant, 
  handleRejectTenant, 
  setAdminTenantId, 
  setActiveTab, 
  customAlert, 
  customConfirm,
  db 
}) => (
  <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
    <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>🛂 Control Center</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage institute registrations and global system status.</p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent)' }}>{allTenants.length}</div>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>Registered Institutes</div>
      </div>
    </div>

    <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '40px' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--warning)' }}>⏳</span> Pending Approvals
        </h3>
      </div>

      {allTenants.filter(t => t.status === 'PENDING_APPROVAL').length === 0 ? (
        <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>✔️</div>
          <p>Queue is empty. All institutes have been processed.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {allTenants.filter(t => t.status === 'PENDING_APPROVAL').map(tenant => (
            <div key={tenant.id} style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--accent-gradient)', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.5rem', fontWeight: 800 }}>
                  {tenant.name?.charAt(0)}
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{tenant.name}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Code: <code style={{ color: 'var(--accent)', fontWeight: 600 }}>{tenant.code}</code>
                    <span style={{ margin: '0 10px', opacity: 0.3 }}>|</span>
                    Admin: <span style={{ color: 'var(--text-primary)' }}>{tenant.adminUid?.slice(0, 12)}...</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" onClick={() => handleApproveTenant?.(tenant)}>Approve Access</button>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleRejectTenant?.(tenant)}>Reject Request</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h3 style={{ margin: 0 }}>Verified Partners</h3>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Institute Name</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Unique Code</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</th>
              <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Management</th>
            </tr>
          </thead>
          <tbody>
            {allTenants.filter(t => t.status !== 'PENDING_APPROVAL').map(tenant => (
              <tr key={tenant.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}>
                <td style={{ padding: '20px 24px', fontWeight: 600 }}>{tenant.name}</td>
                <td style={{ padding: '20px 24px' }}><code style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '4px 8px', borderRadius: '4px', color: 'var(--accent)' }}>{tenant.code}</code></td>
                <td style={{ padding: '20px 24px' }}>
                  <span className={`badge ${tenant.isActive ? 'badge-success' : 'badge-danger'}`}>
                    {tenant.isActive ? 'OPERATIONAL' : 'SUSPENDED'}
                  </span>
                </td>
                <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" style={{ fontSize: '0.85rem' }} onClick={() => {
                      setAdminTenantId?.(tenant.id);
                      setActiveTab?.('lectures'); 
                      customAlert?.(`Now managing ${tenant.name}. Navigate using the sidebar.`, 'Context Switched');
                    }}>
                      📺 Manage
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={async () => {
                      if (await customConfirm?.(`Manually ${tenant.isActive ? 'Suspend' : 'Unsuspend'} ${tenant.name}?`)) {
                        await updateDoc(doc(db, "tenants", tenant.id), { isActive: !tenant.isActive });
                      }
                    }}>
                      {tenant.isActive ? 'Suspend' : 'Unsuspend'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default SuperAdminView;
