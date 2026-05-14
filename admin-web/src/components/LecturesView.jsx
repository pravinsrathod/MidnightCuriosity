import React, { useState, useEffect } from 'react';
import Pagination from './common/Pagination';

const LecturesView = ({ 
  lectures, 
  lectureSubTab, 
  setLectureSubTab, 
  isLectureFormExpanded, 
  setIsLectureFormExpanded, 
  editingId, 
  formData, 
  handleChange, 
  handleUpload, 
  existingVideoUrl,
  quizzes, 
  setQuizzes, 
  handleDelete, 
  handleEdit, 
  grades, 
  batches, 
  subjects, 
  topics,
  loading,
  isGeneratingAI,
  handleGenerateAI
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Reset page when switching subtabs
  useEffect(() => {
    setCurrentPage(1);
  }, [lectureSubTab]);

  // Filter lectures based on current subtab type
  const filteredLectures = lectures.filter(l => l.type === lectureSubTab);

  const displayedLectures = filteredLectures.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* LECTURE SUB-TABS */}
      <div className="lecture-subtabs" style={{ display: 'flex', gap: '8px', padding: '6px', borderRadius: '14px', margin: '0 0 8px 0', background: '#0f172a', border: '1px solid rgba(59, 130, 246, 0.5)', boxShadow: '0 2px 16px rgba(59,130,246,0.2)', zIndex: 50, position: 'sticky', top: '68px' }}>
        <button
          onClick={() => setLectureSubTab('live')}
          className={`btn ${lectureSubTab === 'live' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, height: '40px', fontSize: '0.9rem', borderRadius: '10px', background: lectureSubTab === 'live' ? 'var(--accent-gradient)' : 'transparent', border: 'none' }}
        >
          Live Sessions
        </button>
        <button
          onClick={() => setLectureSubTab('study')}
          className={`btn ${lectureSubTab === 'study' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1, height: '40px', fontSize: '0.9rem', borderRadius: '10px', background: lectureSubTab === 'study' ? 'var(--accent-gradient)' : 'transparent', border: 'none' }}
        >
          Study Material
        </button>
      </div>

      <div className="grid-2" style={{ gap: '32px' }}>
        {/* Upload Form */}
        <div className="glass-panel" style={{ padding: '32px', height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isLectureFormExpanded ? '24px' : '0' }}>
            <h2 style={{ fontSize: '1.75rem', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
              {editingId ? "✏️ Edit Curriculum Entry" : (lectureSubTab === 'live' ? "🎥 Link Live Recording" : "🎬 Publish New Lecture")}
            </h2>
            <button
              onClick={() => setIsLectureFormExpanded(!isLectureFormExpanded)}
              className="btn btn-ghost"
              style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}
            >
              {isLectureFormExpanded ? "Collapse ⬆️" : "Expand ⬇️"}
            </button>
          </div>

          {isLectureFormExpanded && (
            <form onSubmit={handleUpload} className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '24px' }}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="label">Target Classification</label>
                  <select name="grade" value={formData.grade} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                    {grades.length === 0 && <option>Loading...</option>}
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="label">Subject Domain</label>
                  <select name="subject" value={formData.subject} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                    {subjects.length === 0 && <option>Loading...</option>}
                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="label">Target Group (Batch)</label>
                  <select name="batch" value={formData.batch} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                    <option value="All">All Batches</option>
                    {(batches[formData.grade] || ["General Batch"]).map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Curriculum Focus (Topic)</label>
                <select name="topic" value={formData.topic} onChange={handleChange} className="form-control" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}>
                  {topics.length === 0 && <option value="">Add topics in System Configuration</option>}
                  {topics.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="label">Lecture Designation (Title)</label>
                <input
                  type="text"
                  name="title"
                  className="form-control"
                  placeholder="e.g. Introduction to Quantum States"
                  value={formData.title}
                  onChange={handleChange}
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}
                />
              </div>

              {/* YouTube URL / ID input — used for BOTH Study Material and Live Sessions */}
              <div className="form-group">
                <label className="label">
                  {lectureSubTab === 'study' ? '🎬 YouTube Video URL or ID' : '📡 YouTube Video URL or ID'}
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="text"
                    name="youtubeVideoId"
                    className="form-control"
                    placeholder="e.g. dQw4w9WgXcQ or https://youtu.be/dQw4w9WgXcQ"
                    value={formData.youtubeVideoId}
                    onChange={handleChange}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={isGeneratingAI || !formData.youtubeVideoId}
                    className="btn"
                    style={{ 
                      background: isGeneratingAI ? 'rgba(59, 130, 246, 0.2)' : 'var(--accent-gradient)', 
                      color: '#fff', 
                      padding: '0 20px', 
                      height: '42px', 
                      borderRadius: '10px', 
                      fontSize: '0.85rem', 
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: 'none',
                      whiteSpace: 'nowrap',
                      opacity: (!formData.youtubeVideoId && !isGeneratingAI) ? 0.5 : 1
                    }}
                  >
                    {isGeneratingAI ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        Synthesizing...
                      </>
                    ) : "✨ Auto-Generate AI Content"}
                  </button>
                </div>

                {formData.youtubeVideoId && formData.youtubeVideoId.length === 16 && !formData.youtubeVideoId.startsWith('http') && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    ⚠️ <b>Invalid ID:</b> This looks like a <b>YouTube Playback ID</b> (a diagnostic code). 
                    Please copy the 11-character video ID from the URL (e.g., <code>v=...</code>) instead.
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
                  Paste a full YouTube URL (<code>youtu.be/…</code> or <code>watch?v=…</code>) or just the video ID. <br/>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>💡 AI Listening:</span> If captions are missing, we'll try to extract and "listen" to the audio automatically.
                </p>
                {existingVideoUrl && !formData.youtubeVideoId && (
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                    ⚠️ This lecture uses a legacy MP4 file. Add a YouTube URL above to migrate it.
                  </div>
                )}
                {formData.youtubeVideoId && (
                  <div style={{ marginTop: '12px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
                    <img
                      src={`https://img.youtube.com/vi/${formData.youtubeVideoId.replace(/.*(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11}).*/,'$1').substring(0,11)}/mqdefault.jpg`}
                      alt="Video preview"
                      style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', display: 'block' }}
                      onError={e => e.target.style.display = 'none'}
                    />
                  </div>
                )}


              </div>


              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="label" style={{ margin: 0 }}>Executive Summary</label>
                </div>
                <textarea
                  name="overview"
                  className="form-control"
                  value={formData.overview}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Provide a high-level briefing..."
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', resize: 'vertical' }}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="label" style={{ margin: 0 }}>Structured Intelligence (Markdown Enabled)</label>
                </div>
                <textarea
                  name="notes"
                  className="form-control"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={6}
                  placeholder="• Theorem 1&#10;• Formula 2"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', resize: 'vertical', fontFamily: 'monospace' }}
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label className="label" style={{ margin: 0 }}>Raw Video Transcript</label>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent)', cursor: 'help', borderBottom: '1px dotted var(--accent)' }} title="If AI synthesis fails, you can manually paste a transcript here and click 'Synthesize' again.">
                    Transcription Help ℹ️
                  </span>
                </div>
                <textarea
                  name="transcript"
                  className="form-control"
                  value={formData.transcript}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Paste text here if YouTube captions are unavailable..."
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', color: 'var(--text-secondary)', fontSize: '0.85rem', resize: 'vertical' }}
                />
                {!formData.transcript && (
                  <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <p style={{ fontSize: '0.8rem', margin: '0 0 8px 0', color: 'var(--text-primary)', fontWeight: 600 }}>🛟 Transcription Protocol</p>
                    <ul style={{ fontSize: '0.75rem', margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <li><b>Auto-Fetch:</b> We'll pull existing YouTube captions (Fastest).</li>
                      <li><b>AI Listening:</b> No captions? We'll listen to the audio stream (Slower).</li>
                      <li><b>Full Fallback:</b> If blocked, upload the <b>MP4 File</b> to Documents.</li>
                    </ul>
                  </div>
                )}
              </div>

              <hr style={{ borderColor: 'rgba(255,255,255,0.05)', margin: '16px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Interactive Evaluations</h3>
                <button type="button" className="btn btn-ghost" onClick={() => setQuizzes([...quizzes, { question: "", options: ["", "", ""], correctIndex: 0, triggerPercentage: 50 }])} style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>
                  + Append Node
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {quizzes.map((quiz, qIndex) => (
                  <div key={qIndex} style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                    {quizzes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setQuizzes(quizzes.filter((_, i) => i !== qIndex))}
                        style={{ position: 'absolute', top: '16px', right: '16px', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: '0.2s' }}
                      >
                        Remove Node
                      </button>
                    )}

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '24px', height: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '0.75rem', fontWeight: 800 }}>{qIndex + 1}</span>
                        Inquiry
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="State the core question..."
                        value={quiz.question}
                        onChange={(e) => {
                          const newQuizzes = [...quizzes];
                          newQuizzes[qIndex].question = e.target.value;
                          setQuizzes(newQuizzes);
                        }}
                        style={{ background: 'var(--bg-input)' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label className="label">Response Options</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {quiz.options.map((opt, oIndex) => (
                          <div key={oIndex} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                              type="radio"
                              name={`correct-${qIndex}`}
                              checked={quiz.correctIndex === oIndex}
                              onChange={() => {
                                const newQuizzes = [...quizzes];
                                newQuizzes[qIndex].correctIndex = oIndex;
                                setQuizzes(newQuizzes);
                              }}
                            />
                            <input
                              type="text"
                              className="form-control"
                              placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                              value={opt}
                              onChange={(e) => {
                                const newQuizzes = [...quizzes];
                                newQuizzes[qIndex].options[oIndex] = e.target.value;
                                setQuizzes(newQuizzes);
                              }}
                              style={{ background: 'rgba(255,255,255,0.03)', fontSize: '0.9rem' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="label">Activation Threshold: {quiz.triggerPercentage}% through video</label>
                      <input
                        type="range"
                        min="5"
                        max="95"
                        step="5"
                        value={quiz.triggerPercentage}
                        onChange={(e) => {
                          const newQuizzes = [...quizzes];
                          newQuizzes[qIndex].triggerPercentage = parseInt(e.target.value);
                          setQuizzes(newQuizzes);
                        }}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 2, height: '48px', fontSize: '1rem' }}>
                  {loading ? "Transmitting..." : (editingId ? "Update Entry" : "Publish to Curriculum")}
                </button>
                <button type="button" onClick={() => setIsLectureFormExpanded(false)} className="btn btn-ghost" style={{ flex: 1 }}>Discard</button>
              </div>
            </form>
          )}
        </div>

        {/* List Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Resource Registry</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{filteredLectures.length} {lectureSubTab === 'live' ? 'Live' : 'Study'} entries</span>
          </div>

          {displayedLectures.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No entries found for the current selection.</div>
          ) : (
            <>
              {displayedLectures.map(lecture => (
              <div key={lecture.id} className="glass-panel animate-scale-up" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                {/* Thumbnail */}
                {lecture.youtubeVideoId && (
                  <div style={{ flexShrink: 0, width: '80px', height: '52px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img
                      src={`https://img.youtube.com/vi/${lecture.youtubeVideoId}/mqdefault.jpg`}
                      alt="thumb"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.1)', padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{lecture.grade}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{lecture.subject}</span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)', padding: '3px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{lecture.batch || "All"}</span>
                    {lecture.type === 'live'
                      ? <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', padding: '3px 8px', borderRadius: '6px' }}>🔴 Live</span>
                      : <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#a78bfa', background: 'rgba(167, 139, 250, 0.1)', padding: '3px 8px', borderRadius: '6px' }}>🎬 Study</span>
                    }
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', color: 'var(--text-primary)' }}>{lecture.title}</h4>
                  <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    <span>📚 {lecture.topic}</span>
                    <span>🧩 {lecture.quizzes?.length || 0} Quiz Nodes</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-ghost" onClick={() => handleEdit(lecture)} style={{ padding: '10px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(lecture.id, lecture.videoUrl)} disabled={loading}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
              ))}
              
              <Pagination 
                currentPage={currentPage}
                totalItems={filteredLectures.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LecturesView;
