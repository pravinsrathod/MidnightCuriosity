import React, { useState, useEffect } from "react";
import { doc, updateDoc, deleteDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import Pagination from "./common/Pagination";

const StudentsView = ({
  students,
  grades,
  batches,
  adminTenantId,
  tenantData,
  selectedGradeFilter,
  selectedBatchFilter,
  customAlert,
  customConfirm,
  loading,
  setLoading
}) => {
  // Student-specific local state
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState({ name: "", phoneNumber: "", grade: "", batch: "", password: "" });
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentFormData, setStudentFormData] = useState({ name: "", grade: "", batch: "" });
  const [studentSubTab, setStudentSubTab] = useState('students');
  const [searchQuery, setSearchQuery] = useState("");
  const [scholarsPage, setScholarsPage] = useState(1);
  const [guardiansPage, setGuardiansPage] = useState(1);
  const pageSize = 10;

  // Add-child-to-parent modal state
  const [addChildModal, setAddChildModal] = useState({ open: false, parentId: null, parentName: '' });
  const [childSearchQuery, setChildSearchQuery] = useState("");
  const [selectedChildId, setSelectedChildId] = useState(null);

  // Reset pagination when filters change
  useEffect(() => {
    setScholarsPage(1);
    setGuardiansPage(1);
  }, [selectedGradeFilter, selectedBatchFilter, searchQuery, studentSubTab]);

  // ---- STUDENT MANAGEMENT ACTIONS ----
  const handleApproveStudent = async (id) => {
    try {
      await updateDoc(doc(db, "users", id), { status: 'ACTIVE' });
      customAlert("Student Approved!");
    } catch (e) {
      console.error(e);
      customAlert("Failed to approve student");
    }
  };

  const handleApproveChildLink = async (parentId, phoneNumber) => {
    try {
      setLoading(true);
      const parentRef = doc(db, "users", parentId);
      const parentSnap = await getDoc(parentRef);
      if (!parentSnap.exists()) throw new Error("Parent not found");
      
      const data = parentSnap.data();
      const pending = data.pendingChildPhones || [];
      
      if (!pending.includes(phoneNumber)) {
          customAlert("Request no longer exists.");
          return;
      }

      await updateDoc(parentRef, {
        pendingChildPhones: arrayRemove(phoneNumber),
        linkedStudentPhones: arrayUnion(phoneNumber)
      });

      customAlert("Child Link Approved!");
    } catch (e) {
      console.error(e);
      customAlert("Failed to approve link request.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectChildLink = async (parentId, phoneNumber) => {
    if (!await customConfirm("Reject this child link request?")) return;
    try {
      setLoading(true);
      const parentRef = doc(db, "users", parentId);
      await updateDoc(parentRef, {
        pendingChildPhones: arrayRemove(phoneNumber)
      });
      customAlert("Request Rejected.");
    } catch (e) {
      console.error(e);
      customAlert("Failed to reject link request.");
    } finally {
      setLoading(false);
    }
  };

  const openAddChildModal = (parent) => {
    setAddChildModal({ open: true, parentId: parent.id, parentName: parent.name || 'Guardian' });
    setChildSearchQuery("");
    setSelectedChildId(null);
  };

  const closeAddChildModal = () => {
    setAddChildModal({ open: false, parentId: null, parentName: '' });
    setChildSearchQuery("");
    setSelectedChildId(null);
  };

  const handleAdminAddChild = async () => {
    if (!selectedChildId) { customAlert("Please select a student to link."); return; }
    const child = students.find(s => s.id === selectedChildId);
    if (!child) { customAlert("Student not found."); return; }

    const cleanPhone = (child.phoneNumber || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) { customAlert("Selected student has no valid phone number."); return; }

    try {
      setLoading(true);
      await updateDoc(doc(db, "users", addChildModal.parentId), {
        linkedStudentPhones: arrayUnion(cleanPhone)
      });
      customAlert(`✅ ${child.name} linked to ${addChildModal.parentName} successfully!`);
      closeAddChildModal();
    } catch (e) {
      console.error("Error linking child:", e);
      customAlert("Failed to link child. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlinkChild = async (parentId, childPhoneNumber) => {
    const cleanPhone = (childPhoneNumber || '').replace(/[^0-9]/g, '');
    if (!await customConfirm(`Remove this child link from the parent's account?`)) return;
    try {
      setLoading(true);
      const updatePayload = {
        linkedStudentPhones: arrayRemove(cleanPhone)
      };
      // Also clear legacy single-child field if it matches
      const parentSnap = await getDoc(doc(db, "users", parentId));
      if (parentSnap.exists() && parentSnap.data().linkedStudentPhone === cleanPhone) {
        updatePayload.linkedStudentPhone = '';
      }
      await updateDoc(doc(db, "users", parentId), updatePayload);
      customAlert("✅ Child unlinked successfully.");
    } catch (e) {
      console.error("Error unlinking child:", e);
      customAlert("Failed to unlink child. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejectStudent = async (id) => {
    if (!await customConfirm("Reject this student request?")) return;
    try {
      await updateDoc(doc(db, "users", id), { status: 'REJECTED' });
    } catch (e) {
      console.error(e);
      customAlert("Failed to reject student");
    }
  };

  const handleDeleteStudent = async (id) => {
    const confirmed = await customConfirm("Are you sure you want to delete this student? This action cannot be undone.", "Delete Student", true);
    if (confirmed) {
      try {
        await deleteDoc(doc(db, "users", id));
        customAlert("Student deleted successfully.");
      } catch (e) {
        console.error("Error deleting student:", e);
        customAlert("Failed to delete student.");
      }
    }
  };

  const handleEditStudent = (student) => {
    setEditingStudentId(student.id);
    setStudentFormData({
      name: student.name || "",
      grade: student.grade || "",
      batch: student.batch || "General Batch",
      password: student.password || ""
    });
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setStudentFormData({ name: "", grade: "", batch: "" });
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentForm.name || !newStudentForm.phoneNumber || !newStudentForm.grade || !newStudentForm.password) {
      const missing = [];
      if (!newStudentForm.name) missing.push("Name");
      if (!newStudentForm.phoneNumber) missing.push("Phone");
      if (!newStudentForm.grade) missing.push("Grade");
      if (!newStudentForm.password) missing.push("Password");
      customAlert(`Please fill the following fields: ${missing.join(', ')} `);
      return;
    }

    setLoading(true);
    let secondaryApp = null;

    try {
      const { initializeApp } = await import("firebase/app");
      const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import("firebase/auth");
      const { auth: firebaseAuth } = await import("../firebase");
      const firebaseConfig = firebaseAuth.app.options;

      const appName = "SecondaryApp-" + Date.now();
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);

      const cleanPhone = newStudentForm.phoneNumber.replace(/[^0-9]/g, '');
      const virtualEmail = `${cleanPhone}@midnightcuriosity.com`;

      let newUid;

      try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, virtualEmail, newStudentForm.password);
        newUid = userCredential.user.uid;
      } catch (createError) {
        if (createError.code === 'auth/email-already-in-use') {
          try {
            const userCredential = await signInWithEmailAndPassword(secondaryAuth, virtualEmail, newStudentForm.password);
            newUid = userCredential.user.uid;
            customAlert("Note: Student account existed (Auth). Restoring Profile...");
          } catch (signinError) {
            throw new Error("Student exists, but password mismatch. Cannot restore. Please contact support or reset password.");
          }
        } else {
          throw createError;
        }
      }

      const studentData = {
        name: newStudentForm.name,
        phoneNumber: cleanPhone,
        password: newStudentForm.password,
        grade: newStudentForm.grade,
        batch: newStudentForm.batch || 'General Batch',
        tenantId: adminTenantId,
        instituteCode: tenantData.code || adminTenantId,
        role: 'STUDENT',
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        createdBy: 'ADMIN'
      };
      await setDoc(doc(db, "users", newUid), studentData);

      await signOut(secondaryAuth);
    } catch (error) {
      console.error("Error adding student:", error);
      let msg = error.message;
      if (error.code === 'auth/email-already-in-use') msg = "A student with this phone number already exists.";
      customAlert("Failed to add student: " + msg);
    } finally {
      if (secondaryApp) {
        const { deleteApp } = await import("firebase/app");
        try { await deleteApp(secondaryApp); } catch (e) { }
      }
      setLoading(false);
      setNewStudentForm({ name: "", phoneNumber: "", grade: "", batch: "", password: "" });
      setShowAddStudentModal(false);
    }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    if (!studentFormData.name || !studentFormData.grade) {
      customAlert("Please fill in Name and Grade.");
      return;
    }

    try {
      const updatedData = {
        name: studentFormData.name,
        grade: studentFormData.grade,
        batch: studentFormData.batch || 'General Batch',
        updatedAt: serverTimestamp()
      };

      if (studentFormData.password && studentFormData.password.trim() !== "") {
        updatedData.password = studentFormData.password;
      }

      await updateDoc(doc(db, "users", editingStudentId), updatedData);
      customAlert("Student updated successfully!");
      cancelEditStudent();
    } catch (e) {
      console.error("Error updating student:", e);
      customAlert("Failed to update student.");
    }
  };

  // Calculate filtered and paginated data
  const filteredScholars = students.filter(s => 
    (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter) && 
    (selectedBatchFilter === 'All' || s.batch === selectedBatchFilter) && 
    (!s.role || s.role === 'STUDENT' || s.role === 'student') &&
    (!searchQuery || (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())) || (s.phoneNumber && s.phoneNumber.includes(searchQuery)))
  );

  const paginatedScholars = filteredScholars.slice(
    (scholarsPage - 1) * pageSize,
    scholarsPage * pageSize
  );

  const filteredGuardians = students.filter(s => 
    s.role === 'PARENT' &&
    (!searchQuery || (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase())) || (s.phoneNumber && s.phoneNumber.includes(searchQuery)))
  );

  const paginatedGuardians = filteredGuardians.slice(
    (guardiansPage - 1) * pageSize,
    guardiansPage * pageSize
  );

  // Candidates for add-child modal: only ACTIVE/PENDING students (not parents)
  const addChildCandidates = students.filter(s =>
    (!s.role || s.role === 'STUDENT' || s.role === 'student') &&
    (!childSearchQuery ||
      (s.name && s.name.toLowerCase().includes(childSearchQuery.toLowerCase())) ||
      (s.phoneNumber && s.phoneNumber.includes(childSearchQuery)))
  );

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ padding: '24px 32px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '4px', margin: 0 }}>👥 Community Directory</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage enrollments, approvals, and credentials.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddStudentModal(true)}
          style={{ height: '48px', padding: '0 24px', fontSize: '1rem' }}
        >
          + Register New Entry
        </button>
      </div>

      {/* ── Add Child to Parent Modal ── */}
      {addChildModal.open && (
        <div className="animate-fade-in" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div className="card animate-scale-up" style={{ width: '100%', maxWidth: '480px', padding: '32px', border: '1px solid rgba(236,72,153,0.3)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.4rem' }}>🔗 Link Child to Guardian</h3>
              <button className="btn btn-ghost" onClick={closeAddChildModal} style={{ padding: '8px' }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0 24px 0' }}>
              Adding child to <span style={{ color: '#ec4899', fontWeight: 700 }}>{addChildModal.parentName}</span>
            </p>

            {/* Search */}
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: '12px', height: '48px', marginBottom: '16px' }}>
              <span style={{ marginRight: '10px', opacity: 0.5 }}>🔍</span>
              <input
                autoFocus
                type="text"
                placeholder="Search student by name or phone..."
                value={childSearchQuery}
                onChange={e => { setChildSearchQuery(e.target.value); setSelectedChildId(null); }}
                style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%', fontSize: '0.95rem' }}
              />
            </div>

            {/* Student list */}
            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', paddingRight: '4px' }}>
              {addChildCandidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No matching students found.</div>
              ) : (
                addChildCandidates.map(s => {
                  const isSelected = selectedChildId === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedChildId(isSelected ? null : s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                        border: isSelected ? '1px solid #ec4899' : '1px solid var(--border)',
                        background: isSelected ? 'rgba(236,72,153,0.12)' : 'rgba(255,255,255,0.03)',
                        transition: 'all 0.18s ease'
                      }}
                    >
                      <div style={{
                        width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
                        background: isSelected ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'var(--accent-gradient)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        color: '#fff', fontWeight: 700, fontSize: '1rem'
                      }}>
                        {s.name ? s.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.name || 'Unnamed'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.phoneNumber} · Grade {s.grade || '–'} · {s.batch || 'General Batch'}</div>
                      </div>
                      {isSelected && <span style={{ color: '#ec4899', fontSize: '1.2rem' }}>✓</span>}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-ghost" onClick={closeAddChildModal} style={{ flex: 1 }}>Cancel</button>
              <button
                type="button"
                onClick={handleAdminAddChild}
                disabled={!selectedChildId || loading}
                style={{
                  flex: 2, padding: '12px', borderRadius: '10px', border: 'none', cursor: selectedChildId ? 'pointer' : 'not-allowed',
                  background: selectedChildId ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'rgba(255,255,255,0.06)',
                  color: selectedChildId ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.95rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s'
                }}
              >
                {loading ? <span className="loader" style={{ width: '16px', height: '16px' }}></span> : '🔗 Link Child'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="animate-fade-in" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(10px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div className="card animate-scale-up" style={{ width: '100%', maxWidth: '450px', padding: '32px', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Personal Profile Registration</h3>
              <button className="btn btn-ghost" onClick={() => setShowAddStudentModal(false)} style={{ padding: '8px' }}>✕</button>
            </div>

            <form onSubmit={handleAddStudent} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group">
                <label className="label">Full Legal Name</label>
                <input autoFocus placeholder="e.g. Rahul Sharma" value={newStudentForm.name} onChange={e => setNewStudentForm({ ...newStudentForm, name: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }} />
              </div>

              <div className="form-group">
                <label className="label">Contact Line (Phone)</label>
                <input placeholder="e.g. +919876543210" value={newStudentForm.phoneNumber} onChange={e => setNewStudentForm({ ...newStudentForm, phoneNumber: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }} />
              </div>

              <div className="form-group">
                <label className="label">Access Key (Password)</label>
                <input
                  type="password"
                  placeholder="Secure passkey..."
                  value={newStudentForm.password}
                  onChange={e => setNewStudentForm({ ...newStudentForm, password: e.target.value })}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }}
                />
              </div>

              <div className="form-group">
                <label className="label">Assigned Grade</label>
                <select value={newStudentForm.grade} onChange={e => setNewStudentForm({ ...newStudentForm, grade: e.target.value, batch: 'General Batch' })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }}>
                  <option value="">Select Category</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {newStudentForm.grade && (
                <div className="form-group animate-fade-in">
                  <label className="label">Assigned Batch</label>
                  <select 
                    value={newStudentForm.batch || 'General Batch'} 
                    onChange={e => setNewStudentForm({ ...newStudentForm, batch: e.target.value })} 
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }}
                  >
                    <option value="General Batch">General Batch (Default)</option>
                    {(batches[newStudentForm.grade] || []).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddStudentModal(false)} style={{ flex: 1 }}>Discard</button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>{loading ? <span className="loader" style={{ width: '16px', height: '16px' }}></span> : '💾 Establish Link'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Edit Form */}
      {editingStudentId && (
        <div className="glass-panel animate-scale-up" style={{ marginBottom: '32px', padding: '24px', borderColor: 'var(--accent-border)' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '1.25rem' }}>✏️ Update Credentials</h3>
          <form onSubmit={handleUpdateStudent} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label className="label">Display Name</label>
              <input
                type="text"
                className="form-control"
                value={studentFormData.name}
                onChange={(e) => setStudentFormData({ ...studentFormData, name: e.target.value })}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label className="label">Grade</label>
              <select
                className="form-control"
                value={studentFormData.grade}
                onChange={(e) => setStudentFormData({ ...studentFormData, grade: e.target.value, batch: 'General Batch' })}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
              >
                <option value="">Select Category</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
                {!grades.includes(studentFormData.grade) && studentFormData.grade && (
                  <option value={studentFormData.grade}>{studentFormData.grade}</option>
                )}
              </select>
            </div>
            {studentFormData.grade && (
              <div style={{ flex: 1, minWidth: '150px' }} className="animate-fade-in">
                <label className="label">Batch</label>
                <select
                  className="form-control"
                  value={studentFormData.batch || 'General Batch'}
                  onChange={(e) => setStudentFormData({ ...studentFormData, batch: e.target.value })}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
                >
                  <option value="General Batch">General Batch</option>
                  {(batches[studentFormData.grade] || []).map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ flex: 1.5, minWidth: '180px' }}>
              <label className="label">Security Reset (Optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="New security key..."
                value={studentFormData.password || ''}
                onChange={(e) => setStudentFormData({ ...studentFormData, password: e.target.value })}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '8px', width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '12px 24px' }}>Commit</button>
              <button type="button" className="btn btn-ghost" onClick={cancelEditStudent} style={{ padding: '12px 24px' }}>Discard</button>
            </div>
          </form>
        </div>
      )}

      {students.length === 0 ? (
        <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '24px' }}>📂</div>
          <h3>Registry is Empty</h3>
          <p style={{ color: 'var(--text-secondary)' }}>No individuals have been registered in this institute yet.</p>
        </div>
      ) : (
        <>
          {/* Pending Requests Section */}
          {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter) && (selectedBatchFilter === 'All' || s.batch === selectedBatchFilter)).length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem' }}>
                <span style={{ color: 'var(--accent)' }}>❇️</span> Incoming Invitations
                <span className="badge" style={{ background: 'var(--accent)', marginLeft: '10px' }}>
                  {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter) && (selectedBatchFilter === 'All' || s.batch === selectedBatchFilter)).length}
                </span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px' }}>
                {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter) && (selectedBatchFilter === 'All' || s.batch === selectedBatchFilter)).map(s => (
                  <div key={s.id} className="card animate-scale-up" style={{ border: '1px solid var(--accent-border)', background: 'rgba(59, 130, 246, 0.05)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent)', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '1.2rem', fontWeight: 800 }}>
                          {s.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{s.name || "Anonymous Resident"}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.phoneNumber}</div>
                        </div>
                      </div>
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>NEW JOIN</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        {s.role === 'PARENT' ? (
                          <span style={{ color: '#ec4899', fontWeight: 700 }}>PARENT ACCOUNT</span>
                        ) : (
                          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>STUDENT ACCOUNT</span>
                        )}
                      </div>
                      <div style={{ height: '12px', width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Grade: <span style={{ fontWeight: 600 }}>{s.grade}</span></div>
                      {s.batch && s.batch !== "General Batch" && (
                        <>
                          <div style={{ height: '12px', width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Batch: <span style={{ fontWeight: 600 }}>{s.batch}</span></div>
                        </>
                      )}
                    </div>

                    {s.linkedStudentPhone && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        🔗 Relates to student: <span style={{ color: 'var(--text-primary)' }}>{s.linkedStudentPhone}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => handleApproveStudent(s.id)}>Admit</button>
                      <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger-border)' }} onClick={() => handleRejectStudent(s.id)}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB NAVIGATION & SEARCH */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', gap: '16px', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '6px', borderRadius: '14px', flex: 1, minWidth: '300px', maxWidth: '400px' }}>
              <button
                onClick={() => setStudentSubTab('students')}
                className={`btn ${studentSubTab === 'students' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, height: '40px', fontSize: '0.9rem', borderRadius: '10px', background: studentSubTab === 'students' ? 'var(--accent-gradient)' : 'transparent', border: 'none' }}
              >
                Scholars
              </button>
              <button
                onClick={() => setStudentSubTab('parents')}
                className={`btn ${studentSubTab === 'parents' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ flex: 1, height: '40px', fontSize: '0.9rem', borderRadius: '10px', background: studentSubTab === 'parents' ? 'var(--accent-gradient)' : 'transparent', border: 'none' }}
              >
                Guardians
              </button>
            </div>
            
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderRadius: '14px', flex: 1, minWidth: '250px', maxWidth: '350px', height: '52px' }}>
              <span style={{ marginRight: '10px', opacity: 0.5 }}>🔍</span>
              <input 
                type="text" 
                placeholder="Search by name or phone..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: 'white', 
                  outline: 'none', 
                  width: '100%',
                  height: '100%',
                  fontSize: '0.95rem'
                }} 
              />
            </div>
          </div>

          {studentSubTab === 'students' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <h3 style={{ margin: 0 }}>Enrollment Roster</h3>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Identify</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Classification</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Batch</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Verification</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>System Access</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Operations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedScholars.map(s => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', opacity: (s.status === 'REJECTED' || s.status === 'BLOCKED') ? 0.5 : 1 }}>
                          <td style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: s.status === 'ACTIVE' ? 'var(--accent-gradient)' : 'var(--bg-tertiary)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
                                {s.name ? s.name.charAt(0).toUpperCase() : '?'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{s.name || "Scholastic Entry"}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.phoneNumber}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                              {s.grade || "No Grade"}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                              {s.batch || 'General Batch'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            <span className={`badge ${s.status === 'ACTIVE' ? 'badge-success' : (s.status === 'PENDING' ? 'badge-warning' : 'badge-danger')}`}>
                              {s.status || 'ACTIVE'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 24px' }}>
                            {s.deviceId ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                                  {s.deviceId.substring(0, 8)}
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Floating</span>
                            )}
                          </td>
                          <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                              <button onClick={() => handleEditStudent(s)} className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Edit</button>
                              <button onClick={() => handleDeleteStudent(s.id)} className="btn btn-ghost" style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination 
                currentPage={scholarsPage} 
                totalItems={filteredScholars.length} 
                pageSize={pageSize} 
                onPageChange={setScholarsPage} 
              />
            </div>
          )}

          {studentSubTab === 'parents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <h3 style={{ margin: 0 }}>Registered Guardians</h3>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Guardian Identity</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Linked Household</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Status</th>
                        <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Operations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedGuardians.map(p => {
                        const linkedPhones = [p.linkedStudentPhone, ...(p.linkedStudentPhones || [])].filter(Boolean);
                        const pendingPhones = p.pendingChildPhones || [];
                        
                        const linkedStudentsList = students.filter(s2 =>
                          linkedPhones.includes(s2.phoneNumber?.replace(/[^0-9]/g, '')) && s2.role !== 'PARENT'
                        );

                        const pendingStudentsList = students.filter(s2 =>
                          pendingPhones.includes(s2.phoneNumber?.replace(/[^0-9]/g, '')) && s2.role !== 'PARENT'
                        );

                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', opacity: (p.status === 'REJECTED' || p.status === 'BLOCKED') ? 0.5 : 1 }}>
                            <td style={{ padding: '16px 24px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700 }}>
                                  {p.name ? p.name.charAt(0).toUpperCase() : 'G'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{p.name || "Guardian Member"}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.phoneNumber}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '16px 24px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {linkedStudentsList.length > 0 ? linkedStudentsList.map(ls => (
                                    <span key={ls.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '3px 6px 3px 8px', borderRadius: '6px', fontSize: '0.75em', border: '1px solid rgba(236, 72, 153, 0.25)' }}>
                                      {ls.name} ({ls.grade})
                                      <button
                                        onClick={() => handleUnlinkChild(p.id, ls.phoneNumber)}
                                        title={`Unlink ${ls.name}`}
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(236,72,153,0.25)', color: '#ec4899', cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1, padding: 0, flexShrink: 0, transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(236,72,153,0.5)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(236,72,153,0.25)'}
                                      >✕</button>
                                    </span>
                                  )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{p.linkedStudentPhone || 'Unlinked'}</span>}
                                </div>
                                
                                {pendingStudentsList.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase' }}>Pending Approval:</div>
                                    {pendingStudentsList.map(ps => (
                                      <div key={ps.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>{ps.name} ({ps.grade})</span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <button 
                                            onClick={() => handleApproveChildLink(p.id, ps.phoneNumber)}
                                            style={{ padding: '2px 6px', fontSize: '0.65rem', borderRadius: '4px', background: 'var(--success)', border: 'none', color: '#fff', cursor: 'pointer' }}
                                          >Approve</button>
                                          <button 
                                            onClick={() => handleRejectChildLink(p.id, ps.phoneNumber)}
                                            style={{ padding: '2px 6px', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--danger)', color: 'var(--danger)', cursor: 'pointer' }}
                                          >Deny</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '16px 24px' }}>
                              <span className={`badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                                {p.status || 'UNVERIFIED'}
                              </span>
                            </td>
                            <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => openAddChildModal(p)}
                                  className="btn btn-ghost"
                                  style={{ fontSize: '0.8rem', color: '#ec4899', borderColor: 'rgba(236,72,153,0.4)', whiteSpace: 'nowrap' }}
                                  title="Link a student to this guardian"
                                >
                                  + Add Child
                                </button>
                                <button onClick={() => handleEditStudent(p)} className="btn btn-ghost" style={{ fontSize: '0.85rem' }}>Modify</button>
                                <button onClick={() => handleDeleteStudent(p.id)} className="btn btn-ghost" style={{ fontSize: '0.85rem', color: 'var(--danger)' }}>Remove</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination 
                currentPage={guardiansPage} 
                totalItems={filteredGuardians.length} 
                pageSize={pageSize} 
                onPageChange={setGuardiansPage} 
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentsView;
