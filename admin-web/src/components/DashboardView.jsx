import React from 'react';

/**
 * DashboardView Component: The main landing page for the admin portal.
 * Hardened with extensive null-checks to prevent crashes during data loading.
 */
const DashboardView = ({ 
  user = {}, 
  stats = {}, 
  recentUploads = [], 
  setActiveTab, 
  setIsLectureFormExpanded,
  tenantData = {}
}) => {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const features = tenantData?.features || {};
  const isFeesEnabled = features.enableFees !== false;
  const isAttendanceEnabled = features.enableAttendance !== false;
  const isLecturesEnabled = features.enableLectures !== false;
  const isExamsEnabled = features.enableExams !== false;

  // Safe stats values with defaults
  const activeStudents = stats?.activeStudents || 0;
  const liveSessions = stats?.liveSessions || 0;
  const monthlyRevenue = stats?.monthlyRevenue || 0;
  const todayAttendance = stats?.todayAttendance || 0;
  const pendingStudents = stats?.pendingStudents || 0;
  const pendingDoubts = stats?.pendingDoubts || 0;
  const deletionRequests = stats?.deletionRequests || 0;
  const totalPending = pendingStudents + pendingDoubts + deletionRequests;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Dashboard Hero */}
      <div className="dashboard-hero">
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>Good Day, {user?.displayName?.split(' ')[0] || "Admin"}! 👋</h1>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>Today is {today}. Your institute is running smoothly.</p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)', fontSize: '0.9rem', fontWeight: 600 }}>
              🚀 {activeStudents} Active Students
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px 16px', borderRadius: '12px', backdropFilter: 'blur(10px)', fontSize: '0.9rem', fontWeight: 600 }}>
              ⚡ {liveSessions} Ongoing Sessions
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', right: '-50px', top: '-50px', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '150px' }}></div>
      </div>

      {/* Global Stats Grid */}
      <div className="stats-grid">
        {isFeesEnabled && (
          <div className="card stat-card">
            <div className="stat-label">Monthly Revenue</div>
            <div className="stat-value">₹ {(monthlyRevenue).toLocaleString()}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>Collected this month</div>
            <div style={{ position: 'absolute', right: '20px', top: '32px', fontSize: '2rem', opacity: 0.1 }}>💰</div>
          </div>
        )}
        {isAttendanceEnabled && (
          <div className="card stat-card">
            <div className="stat-label">Today's Attendance</div>
            <div className="stat-value">{todayAttendance}%</div>
            <div style={{ fontSize: '0.85rem', color: todayAttendance > 80 ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
              {todayAttendance > 0 ? 'Checked across all classes' : 'No records yet'}
            </div>
            <div style={{ position: 'absolute', right: '20px', top: '32px', fontSize: '2rem', opacity: 0.1 }}>📅</div>
          </div>
        )}
        <div className="card stat-card">
          <div className="stat-label">Pending Actions</div>
          <div className="stat-value" style={{ color: totalPending > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {totalPending}
          </div>
          <div style={{ fontSize: '0.85rem', color: totalPending > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
            Requires review soon
          </div>
          <div style={{ position: 'absolute', right: '20px', top: '32px', fontSize: '2rem', opacity: 0.1 }}>⚠️</div>
        </div>
      </div>

      {/* Action Center & Activity Feed */}
      <div className="grid-2">
        {/* Action Center */}
        <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>🚩 Priority Actions</h3>
            <span className="badge badge-warning">{pendingStudents + (features.enableDoubts !== false ? pendingDoubts : 0)} pending</span>
          </div>
          <div style={{ padding: '0' }}>
            {pendingStudents > 0 && (
              <div onClick={() => setActiveTab?.('students')} style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🎓</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{pendingStudents} New Student Approvals</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Review registration requests to grant access.</div>
                </div>
                <div style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>→</div>
              </div>
            )}
            {pendingDoubts > 0 && features.enableDoubts !== false && (
              <div onClick={() => setActiveTab?.('doubts')} style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>💬</div>
                <div>
                  <div style={{ fontWeight: 600 }}>{pendingDoubts} Unsolved Doubts</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Students are waiting for your help on recent topics.</div>
                </div>
                <div style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>→</div>
              </div>
            )}
            {(pendingStudents === 0 && (features.enableDoubts === false || pendingDoubts === 0)) && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎉</div>
                <div>Looking good! All caught up.</div>
              </div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        {isLecturesEnabled && (
          <div className="glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>📚 Recent Content</h3>
              <button className="btn btn-ghost" onClick={() => setActiveTab?.('lectures')} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>View All</button>
            </div>
            <div style={{ padding: '0' }}>
              {(!recentUploads || recentUploads.length === 0) ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>No recent content uploaded.</div>
              ) : (
                recentUploads.slice(0, 3).map(lecture => (
                  <div key={lecture.id} style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '50px', height: '35px', borderRadius: '4px', background: '#000', overflow: 'hidden' }}>
                      {lecture.youtubeVideoId && <img src={`https://img.youtube.com/vi/${lecture.youtubeVideoId}/mqdefault.jpg`} alt="Video" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{lecture.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lecture.subject} • {lecture.grade}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '16px' }}>
        <h3 style={{ marginBottom: '20px' }}>⚡ Quick Start</h3>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {isLecturesEnabled && (
            <button onClick={() => { setActiveTab?.('lectures'); if (setIsLectureFormExpanded) setIsLectureFormExpanded(true); }} className="card" style={{ padding: '24px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>📽️</div>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>New Study Material</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Upload study material or video lessons.</div>
            </button>
          )}
          {isAttendanceEnabled && (
            <button onClick={() => setActiveTab?.('attendance')} className="card" style={{ padding: '24px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>📅</div>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Attendance</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mark daily attendance for students.</div>
            </button>
          )}
          {isFeesEnabled && (
            <button onClick={() => setActiveTab?.('fees')} className="card" style={{ padding: '24px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>💰</div>
              <div style={{ fontWeight: 700, marginBottom: '4px' }}>Add Fees</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Log a new fee payment from a student.</div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
