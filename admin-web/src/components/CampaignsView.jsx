import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import Pagination from './common/Pagination';

const CampaignsView = ({ tenantId }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    actionLink: '',
    targetAudience: [],
    isActive: true,
    startDate: '',
    endDate: '',
    sequence: 0,
  });
  const [imageFile, setImageFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!tenantId) return;
    
    const q = query(
      collection(db, 'campaigns'),
      where('tenantId', '==', tenantId)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = [];
      snapshot.forEach(doc => fetched.push({ id: doc.id, ...doc.data() }));
      // Sort by sequence first, then creation time
      fetched.sort((a, b) => {
        if ((a.sequence || 0) !== (b.sequence || 0)) {
          return (a.sequence || 0) - (b.sequence || 0);
        }
        return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
      });
      setCampaigns(fetched);
    });
    
    return () => unsubscribe();
  }, [tenantId]);

  const handleAudienceToggle = (type) => {
    setFormData(prev => {
      const current = prev.targetAudience;
      if (current.includes(type)) {
        return { ...prev, targetAudience: current.filter(t => t !== type) };
      } else {
        return { ...prev, targetAudience: [...current, type] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.targetAudience.length === 0) {
      alert("Please select at least one target audience.");
      return;
    }
    
    setLoading(true);
    try {
      let imageUrl = formData.imageUrl || ''; // Keep existing if editing and no new file
      if (imageFile) {
        const imageRef = ref(storage, `campaigns/${tenantId}/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }
      
      if (editingCampaignId) {
        await updateDoc(doc(db, 'campaigns', editingCampaignId), {
          ...formData,
          imageUrl,
          tenantId,
        });
      } else {
        await addDoc(collection(db, 'campaigns'), {
          ...formData,
          imageUrl,
          tenantId,
          createdAt: serverTimestamp()
        });
      }
      
      closeModal();
    } catch (error) {
      console.error("Error saving campaign:", error);
      alert("Failed to save campaign. Check permissions and try again.");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (campaign) => {
    setFormData({
      title: campaign.title || '',
      content: campaign.content || '',
      actionLink: campaign.actionLink || '',
      targetAudience: campaign.targetAudience || [],
      isActive: campaign.isActive,
      startDate: campaign.startDate || '',
      endDate: campaign.endDate || '',
      sequence: campaign.sequence || 0,
      imageUrl: campaign.imageUrl || '' // preserve existing image URL in formData
    });
    setEditingCampaignId(campaign.id);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setFormData({ title: '', content: '', actionLink: '', targetAudience: [], isActive: true, startDate: '', endDate: '', sequence: 0 });
    setEditingCampaignId(null);
    setImageFile(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCampaignId(null);
    setFormData({ title: '', content: '', actionLink: '', targetAudience: [], isActive: true, startDate: '', endDate: '', sequence: 0 });
    setImageFile(null);
  };

  const toggleStatus = async (campaign) => {
    try {
      await updateDoc(doc(db, 'campaigns', campaign.id), {
        isActive: !campaign.isActive
      });
    } catch (error) {
      console.error("Error toggling status:", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this campaign?")) {
      try {
        await deleteDoc(doc(db, 'campaigns', id));
      } catch (error) {
        console.error("Error deleting campaign:", error);
      }
    }
  };

  const displayedCampaigns = campaigns.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', margin: 0 }}>📢 Institute Campaigns</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Manage banners and announcements for your students and parents.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          + Create Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No campaigns found. Create one to get started!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {displayedCampaigns.map(campaign => (
            <div key={campaign.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', borderLeft: campaign.isActive ? '4px solid var(--success)' : '4px solid var(--border)' }}>
              {campaign.imageUrl && (
                <div style={{ width: '100%', height: '160px', overflow: 'hidden' }}>
                  <img src={campaign.imageUrl} alt={campaign.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{campaign.title}</h3>
                  <span className="badge" style={{ background: campaign.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.1)', color: campaign.isActive ? 'var(--success)' : 'var(--text-secondary)', fontSize: '0.7rem' }}>
                    {campaign.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>
                <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', flex: 1, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{campaign.content}</p>
                
                {(campaign.startDate || campaign.endDate) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    <span style={{ marginRight: '12px' }}>📅 <strong>Start:</strong> {campaign.startDate || 'N/A'}</span>
                    <span style={{ marginRight: '12px' }}>🛑 <strong>End:</strong> {campaign.endDate || 'N/A'}</span>
                    <span>🔢 <strong>Seq:</strong> {campaign.sequence || 0}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {campaign.targetAudience?.map(aud => (
                    <span key={aud} style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                      {aud}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => toggleStatus(campaign)}>
                      {campaign.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => openEditModal(campaign)}>
                      Edit
                    </button>
                  </div>
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', color: 'var(--danger)', fontSize: '0.85rem' }} onClick={() => handleDelete(campaign.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {campaigns.length > pageSize && (
        <div style={{ marginTop: '24px' }}>
          <Pagination currentPage={currentPage} totalItems={campaigns.length} pageSize={pageSize} onPageChange={setCurrentPage} />
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px' }}>{editingCampaignId ? 'Edit Campaign' : 'Create Campaign'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="label">Campaign Title</label>
                <input type="text" className="form-control" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required placeholder="E.g., Summer Camp 2026" />
              </div>
              
              <div className="form-group">
                <label className="label">Content / Description</label>
                <textarea className="form-control" value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} required rows="3" placeholder="Describe the announcement..."></textarea>
              </div>

              <div className="form-group">
                <label className="label">Action Link (Optional)</label>
                <input type="url" className="form-control" value={formData.actionLink} onChange={e => setFormData({...formData, actionLink: e.target.value})} placeholder="https://..." />
              </div>

              <div className="form-group">
                <label className="label">Target Audience</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.targetAudience.includes('STUDENT')} onChange={() => handleAudienceToggle('STUDENT')} />
                    Students
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.targetAudience.includes('PARENT')} onChange={() => handleAudienceToggle('PARENT')} />
                    Parents
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Display Sequence</label>
                <input type="number" className="form-control" value={formData.sequence} onChange={e => setFormData({...formData, sequence: Number(e.target.value)})} placeholder="Lower numbers appear first" />
                <small style={{ color: 'var(--text-secondary)' }}>Lower numbers appear first in the carousel.</small>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Start Date (Optional)</label>
                  <input type="date" className="form-control" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">End Date (Optional)</label>
                  <input type="date" className="form-control" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Campaign Image (Optional)</label>
                {formData.imageUrl && !imageFile && (
                  <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Current image will be kept. Upload a new one to replace it.
                  </div>
                )}
                <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} style={{ color: 'var(--text-primary)' }} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
                  {loading ? 'Saving...' : (editingCampaignId ? 'Update Campaign' : 'Create Campaign')}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeModal} style={{ flex: 1 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignsView;
