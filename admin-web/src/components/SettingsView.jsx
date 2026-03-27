import React, { useState } from 'react';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";
import { 
  doc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove,
  writeBatch
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { storage, db, functions } from "../firebase";

const ConfigList = ({ title, items, type, addItem, removeItem }) => {
  const [newItem, setNewItem] = useState("");
  return (
    <div style={{ marginBottom: '20px', background: 'var(--bg-input)', padding: '15px', borderRadius: '8px' }}>
      <h4 style={{ marginBottom: '10px' }}>{title}</h4>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <input
          type="text"
          className="form-control"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`Add new ${title}`}
          style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '8px 12px', borderRadius: '8px' }}
        />
        <button onClick={() => { addItem(type, newItem); setNewItem(""); }} className="btn btn-primary" style={{ padding: '0 15px' }}>Add</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {items.map(item => (
          <span key={item} style={{ background: '#334155', color: '#fff', padding: '5px 10px', borderRadius: '15px', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px' }}>
            {item}
            <span onClick={() => removeItem(type, item)} style={{ cursor: 'pointer', fontWeight: 'bold', color: '#cbd5e1', marginLeft: '5px' }}>×</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const SettingsView = ({ 
  adminTenantId, 
  tenantData, 
  grades, 
  batches, 
  subjects, 
  topics, 
  loading, 
  isEditingTenant, 
  tenantEditForm, 
  file, 
  setIsEditingTenant, 
  setFile, 
  setTenantEditForm, 
  handleUpdateTenantInfo, 
  handleLogoChange, 
  handleMigrateLegacyBatches, 
  handleInitializePlaylists, 
  handleBackfillLecturePlaylists,
  addItem,
  removeItem,
  handleAddBatch,
  handleRemoveBatch
}) => {

  const BatchConfigList = () => {
    const [selectedConfigGrade, setSelectedConfigGrade] = useState(grades[0] || "");
    const [newBatch, setNewBatch] = useState("");

    return (
      <div style={{ marginBottom: '20px', background: 'var(--bg-input)', padding: '15px', borderRadius: '8px' }}>
        <h4 style={{ marginBottom: '10px' }}>Batch Assignments</h4>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <select 
            value={selectedConfigGrade} 
            onChange={e => setSelectedConfigGrade(e.target.value)} 
            style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: '#fff', border: '1px solid var(--border)', flex: 1 }}
          >
            <option value="">Select Grade</option>
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input
            type="text"
            className="form-control"
            value={newBatch}
            onChange={(e) => setNewBatch(e.target.value)}
            placeholder="Add new Batch"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: '#fff', padding: '8px 12px', borderRadius: '8px' }}
          />
          <button onClick={() => { if(selectedConfigGrade) handleAddBatch(selectedConfigGrade, newBatch); setNewBatch(""); }} className="btn btn-primary" style={{ padding: '0 15px' }}>Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {selectedConfigGrade && (batches[selectedConfigGrade] || ["General Batch"]).map(item => (
            <span key={item} style={{ background: '#334155', color: '#fff', padding: '5px 10px', borderRadius: '15px', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {item}
              <span onClick={() => handleRemoveBatch(selectedConfigGrade, item)} style={{ cursor: 'pointer', fontWeight: 'bold', color: '#cbd5e1', marginLeft: '5px' }}>×</span>
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in grid-2" style={{ gap: '32px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Tenant Profile Card */}
        <div className="glass-panel" style={{ padding: '32px', borderColor: 'var(--accent-border)', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(30, 58, 138, 0.05) 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0 }}>🏢 {tenantData.name || "Institute Environment"}</h2>
            {!isEditingTenant && (
              <button onClick={() => setIsEditingTenant(true)} className="btn btn-ghost" style={{ fontSize: '0.8rem' }}>Edit Identity</button>
            )}
          </div>

          {isEditingTenant ? (
            <form onSubmit={handleUpdateTenantInfo} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group">
                <label className="label">Brand Asset (Logo)</label>
                <input type="file" accept="image/*" onChange={handleLogoChange} />
                {tenantData.logoUrl && !file && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src={tenantData.logoUrl} alt="Brand" style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Emblem</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="label">Public Title</label>
                <input
                  type="text"
                  className="form-control"
                  value={tenantEditForm.name}
                  onChange={e => setTenantEditForm({ ...tenantEditForm, name: e.target.value })}
                  required
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label className="label">Registry Identifier (Code)</label>
                <input
                  type="text"
                  className="form-control"
                  value={tenantEditForm.code}
                  onChange={e => setTenantEditForm({ ...tenantEditForm, code: e.target.value })}
                  required
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>{loading ? "Persisting..." : "Save Identity"}</button>
                <button type="button" onClick={() => { setIsEditingTenant(false); setFile(null); }} className="btn btn-ghost" style={{ flex: 1 }}>Discard</button>
              </div>
            </form>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Invitation Token</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent)', letterSpacing: '4px' }}>
                {tenantData.code || adminTenantId}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '12px', fontFamily: 'monospace' }}>
                UUID: {adminTenantId}
              </div>
              <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--text-primary)', lineHeight: '1.5' }}>
                  <strong>Distribution Directive:</strong> Provide this token to authorized members. Re-generation requires administrative clearance.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="glass-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>System Taxonomies</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Define standardized classifications for your ecosystem.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <ConfigList title="Grade Levels" items={grades} type="grades" addItem={addItem} removeItem={removeItem} />
            <BatchConfigList />
            <ConfigList title="Subject Clusters" items={subjects} type="subjects" addItem={addItem} removeItem={removeItem} />
          </div>
        </div>

      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div className="glass-panel" style={{ padding: '32px' }}>
          <ConfigList title="Topic Schema" items={topics} type="topics" addItem={addItem} removeItem={removeItem} />
        </div>

        <div className="glass-panel" style={{ padding: '32px', borderColor: 'var(--warning-border)', background: 'rgba(245, 158, 11, 0.05)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '12px', color: 'var(--warning)' }}>⚠️ Administrative Actions</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Apply sweeping changes to the student registry.</p>
          <button className="btn btn-ghost" onClick={handleMigrateLegacyBatches} style={{ color: 'var(--warning)', border: '1px solid var(--warning-border)', marginBottom: '12px', width: '100%' }}>
            Initialize Legacy Batch Migration
          </button>
          <button className="btn btn-ghost" onClick={handleInitializePlaylists} style={{ color: 'var(--accent)', border: '1px solid var(--accent-border)', marginBottom: '12px', width: '100%' }}>
            Initialize YouTube Playlists
          </button>
          <button className="btn btn-ghost" onClick={handleBackfillLecturePlaylists} style={{ color: 'var(--success)', border: '1px solid var(--success-border)', width: '100%' }}>
            Migrate Videos to Playlists
          </button>
        </div>

        {/* OBS Configuration */}
        <div className="glass-panel" style={{ padding: '32px', borderColor: 'var(--accent-border)', background: 'rgba(59, 130, 246, 0.05)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>🎥 Live Stream Configuration</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Follow this guide to set up OBS Studio for your live classes.</p>
          
          <div style={{ padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem' }}>🛠️ OBS Studio Setup Guide</h4>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              • Open <strong>OBS Studio</strong> on your computer.<br/>
              • Go to <strong>Settings &gt; Stream</strong>.<br/>
              • Set Service to <strong>Custom</strong>.<br/>
              • <strong>Server URL</strong>: Obtain this from the <em>Live</em> tab after starting a session.<br/>
              • <strong>Stream Key</strong>: Obtain this from the <em>Live</em> tab after starting a session.<br/>
              • <strong>Output Settings</strong>: We recommend <em>720p 30fps</em> with <em>2500kbps</em> bitrate for optimal stability.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
