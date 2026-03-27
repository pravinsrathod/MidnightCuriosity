{
  activeTab === 'students' && (
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
                <select value={newStudentForm.grade} onChange={e => setNewStudentForm({ ...newStudentForm, grade: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white' }}>
                  <option value="">Select Category</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddStudentModal(false)} style={{ flex: 1 }}>Discard</button>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>{loading ? <span className="loader" style={{ width: '16px', height: '16px' }}></span> : '💾 Establish Link'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Edit Form */}
      {
        editingStudentId && (
          <div style={{ marginBottom: '30px', padding: '20px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--accent)' }}>
            <h3 style={{ marginBottom: '15px' }}>Edit Student</h3>
            <form onSubmit={handleUpdateStudent} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  value={studentFormData.name}
                  onChange={(e) => setStudentFormData({ ...studentFormData, name: e.target.value })}
                  placeholder="Student Name"
                />
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="label">Grade</label>
                <select
                  value={studentFormData.grade}
                  onChange={(e) => setStudentFormData({ ...studentFormData, grade: e.target.value })}
                >
                  <option value="">Select Grade</option>
                  {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  {/* Fallback option if current grade isn't in config list */}
                  {!grades.includes(studentFormData.grade) && studentFormData.grade && (
                    <option value={studentFormData.grade}>{studentFormData.grade}</option>
                  )}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label className="label">New Password (Opt)</label>
                <input
                  type="text"
                  placeholder="Reset Password"
                  value={studentFormData.password || ''}
                  onChange={(e) => setStudentFormData({ ...studentFormData, password: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn-primary">Save Changes</button>
                <button type="button" className="btn-ghost" onClick={cancelEditStudent}>Cancel</button>
              </div>
            </form>
          </div>
        )
      }

      {students.length === 0 ? (
        <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '24px' }}>📂</div>
          <h3>Registry is Empty</h3>
          <p style={{ color: 'var(--text-secondary)' }}>No individuals have been registered in this institute yet.</p>
        </div>
      ) : (
        <>
          {/* Pending Requests Section */}
          {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.25rem' }}>
                <span style={{ color: 'var(--accent)' }}>❇️</span> Incoming Invitations
                <span className="badge" style={{ background: 'var(--accent)', marginLeft: '10px' }}>
                  {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).length}
                </span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px' }}>
                {students.filter(s => s.status === 'PENDING' && (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter)).map(s => (
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

          {/* STUDENTS TAB START */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setStudentSubTab('students')}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: studentSubTab === 'students' ? '2px solid var(--accent)' : 'none',
                color: studentSubTab === 'students' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Students
            </button>
            <button
              onClick={() => setStudentSubTab('parents')}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: 'none',
                borderBottom: studentSubTab === 'parents' ? '2px solid var(--accent)' : 'none',
                color: studentSubTab === 'parents' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Parents
            </button>
          </div>

          {studentSubTab === 'students' && (
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
                      <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Verification</th>
                      <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>System Access</th>
                      <th style={{ padding: '16px 24px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Operations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.filter(s => (selectedGradeFilter === 'All' || s.grade === selectedGradeFilter) && (!s.role || s.role === 'STUDENT' || s.role === 'student')).map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', opacity: (s.status === 'REJECTED' || s.status === 'BLOCKED') ? 0.6 : 1 }}>
                        <td style={{ padding: '15px 10px', fontWeight: 'bold' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '30px', height: '30px', borderRadius: '15px', background: s.status === 'ACTIVE' ? 'var(--success)' : 'var(--accent)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontSize: '0.8rem' }}>
                              {s.name ? s.name.charAt(0).toUpperCase() : '?'}
                            </span>
                            <div>
                              {s.name || "Anonymous"}
                              <div style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>{s.phoneNumber}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.85em' }}>
                            {s.grade || "N/A"}
                          </span>

                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontWeight: 'bold',
                            background: s.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: s.status === 'ACTIVE' ? 'var(--success)' : 'var(--warning)'
                          }}>
                            {s.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {s.tenantId || "None"}
                          </span>
                        </td>
                        <td style={{ padding: '10px' }}>
                          {s.deviceId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.deviceId.substring(0, 8)}...</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                              onClick={() => handleEditStudent(s)}
                              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              style={{ background: 'var(--danger)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
                )}

              {studentSubTab === 'parents' && (
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
                        {students.filter(s => s.role === 'PARENT').map(p => {
                          // Find ALL linked student names (check both single phone and array)
                          const linkedPhones = [p.linkedStudentPhone, ...(p.linkedStudentPhones || [])].filter(Boolean);
                          const linkedStudents = students.filter(s2 =>
                            linkedPhones.includes(s2.phoneNumber?.replace(/[^0-9]/g, '')) && s2.role !== 'PARENT'
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
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {linkedStudents.length > 0 ? linkedStudents.map(ls => (
                                    <span key={ls.id} style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75em', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                                      {ls.name} ({ls.grade})
                                    </span>
                                  )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>{p.linkedStudentPhone || 'Unlinked'}</span>}
                                </div>
                              </td>
                              <td style={{ padding: '16px 24px' }}>
                                <span className={`badge ${p.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                                  {p.status || 'UNVERIFIED'}
                                </span>
                              </td>
                              <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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
              )}
            </>
          )}
        </div>
        )}


      {/* Attendance Tab */}
      {
