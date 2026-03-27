import React from 'react';

const DoubtsView = ({ doubts, replyText, setReplyText, handleAiSolve, postAdminReply }) => {
  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      {doubts.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '80px 40px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '24px' }}>✨</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Workspace is Serene</h3>
          <p style={{ color: 'var(--text-secondary)' }}>All student inquiries have been resolved. Excellent work.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Resolution Queue</h3>
            <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
          </div>

          {doubts.map(d => (
            <div key={d.id} className="glass-panel animate-scale-up" style={{ padding: '24px', borderLeft: d.solved ? '4px solid var(--success)' : '4px solid var(--warning)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ padding: '6px 14px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{d.subject}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{d.userName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Posted {new Date(d.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <span className={`badge ${d.solved ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>{d.solved ? 'RESOLVED' : 'PENDING'}</span>
              </div>

              <p style={{ fontSize: '1.15rem', color: 'var(--text-primary)', lineHeight: '1.6', margin: '0 0 24px 0', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>{d.question}</p>

              {/* Replies */}
              {d.replies && d.replies.length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600, textTransform: 'uppercase' }}>Discussion Thread</div>
                  {d.replies.map((r, i) => (
                    <div key={i} style={{ marginBottom: i < d.replies.length - 1 ? '16px' : 0, paddingBottom: i < d.replies.length - 1 ? '16px' : 0, borderBottom: i < d.replies.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: r.isCorrect ? 'var(--success)' : 'var(--text-primary)' }}>{r.userName}</span>
                        {r.isCorrect && <span style={{ fontSize: '0.75rem', color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>✓ OFFICIAL</span>}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>{r.text}</div>
                    </div>
                  ))}
                </div>
              )}

              {!d.solved && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8rem', height: '36px', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                      onClick={() => handleAiSolve(d.id, d.question)}
                    >
                      <span style={{ marginRight: '8px' }}>✨</span> Deploy A.I. Solver
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <textarea
                      rows={3}
                      placeholder="Draft your expert response..."
                      value={replyText[d.id] || ""}
                      onChange={(e) => setReplyText({ ...replyText, [d.id]: e.target.value })}
                      style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'white', resize: 'vertical', fontSize: '1rem' }}
                    />
                    <button className="btn btn-primary" style={{ height: '48px', padding: '0 24px', alignSelf: 'flex-end' }} onClick={() => postAdminReply(d.id)}>Submit Resolution</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DoubtsView;
