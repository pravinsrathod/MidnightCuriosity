import React, { useState } from 'react';
import Pagination from './common/Pagination';

const PollsView = ({ 
  polls, 
  pollFormData, 
  setPollFormData, 
  handleCreatePoll, 
  togglePollStatus, 
  deletePoll, 
  loading, 
  grades, 
  batches 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const displayedPolls = polls.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ marginBottom: '40px', padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', margin: 0 }}>📊 Engagement Studio</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Launch interactive live polls for student cohorts.</p>
          </div>
        </div>

        <form onSubmit={handleCreatePoll} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '20px' }}>
            <div className="form-group">
              <label className="label">Target Grade</label>
              <select
                className="form-control"
                value={pollFormData.grade}
                onChange={(e) => setPollFormData({ ...pollFormData, grade: e.target.value, batch: "All" })}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="All">Global (All Grades)</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Target Batch</label>
              <select
                className="form-control"
                value={pollFormData.batch}
                onChange={(e) => setPollFormData({ ...pollFormData, batch: e.target.value })}
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="All">All Batches</option>
                {(batches[pollFormData.grade] || ["General Batch"]).map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '-12px' }}>
            <label className="label">Inquiry Question</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Which concept requires more clarification?"
              value={pollFormData.question}
              onChange={(e) => setPollFormData({ ...pollFormData, question: e.target.value })}
              required
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
            />
          </div>

          <div>
            <label className="label" style={{ marginBottom: '12px', display: 'block' }}>Response Parameters</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
              <input type="text" placeholder="Option A" value={pollFormData.optionA} onChange={e => setPollFormData({ ...pollFormData, optionA: e.target.value })} required style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
              <input type="text" placeholder="Option B" value={pollFormData.optionB} onChange={e => setPollFormData({ ...pollFormData, optionB: e.target.value })} required style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
              <input type="text" placeholder="Option C (Optional)" value={pollFormData.optionC} onChange={e => setPollFormData({ ...pollFormData, optionC: e.target.value })} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
              <input type="text" placeholder="Option D (Optional)" value={pollFormData.optionD} onChange={e => setPollFormData({ ...pollFormData, optionD: e.target.value })} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px' }} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '12px 32px', fontSize: '1rem' }} disabled={loading}>
            {loading ? 'Initiating...' : '🚀 Broadcast Live Poll'}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Historical Feed</h3>
        <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
      </div>

      {polls.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No polls have been recorded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {displayedPolls.map(poll => (
            <div key={poll.id} className="glass-panel animate-scale-up" style={{ padding: '24px', borderLeft: poll.active ? '4px solid var(--success)' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    {poll.active ? (
                      <span className="badge" style={{ background: 'var(--danger)', animation: 'pulse 2s infinite', fontSize: '0.7rem' }}>● LIVE NOW</span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>CONCLUDED</span>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>{poll.grade || 'Global'}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-light)', fontWeight: 700, textTransform: 'uppercase' }}>• {poll.batch || 'All'}</span>
                    </div>
                  </div>
                  <h4 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', color: 'var(--text-primary)' }}>{poll.question}</h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {poll.options.map((opt, i) => {
                      const percentage = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            <span>{String.fromCharCode(65 + i)}. {opt.text}</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{percentage}% ({opt.votes})</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${percentage}%`, background: poll.active ? 'var(--accent-gradient)' : 'var(--text-muted)', height: '100%', borderRadius: '4px', transition: 'width 0.5s ease-out' }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '16px' }}>
                    Aggregated Participation: {poll.totalVotes || 0} respondents
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginLeft: '24px' }}>
                  <button className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '8px 12px' }} onClick={() => togglePollStatus(poll)}>
                    {poll.active ? 'End Stream' : 'Restart'}
                  </button>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '8px 12px' }} onClick={() => deletePoll(poll.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          <Pagination 
            currentPage={currentPage}
            totalItems={polls.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </div>
  );
};

export default PollsView;
