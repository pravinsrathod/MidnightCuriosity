import React from 'react';

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
  handleFileChange, 
  existingVideoUrl, 
  file, 
  aiLoading, 
  saveApiKey, 
  apiKey, 
  handleAiGenerate, 
  quizzes, 
  setQuizzes, 
  handleDelete, 
  handleEdit, 
  grades, 
  batches, 
  subjects, 
  topics,
  loading
}) => {
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

              {lectureSubTab === 'study' ? (
                <div className="form-group">
                  <label className="label">Cinematic Material (MP4)</label>
                  <input type="file" accept="video/*" onChange={handleFileChange} />
                  {existingVideoUrl && !file && (
                    <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                      ✅ Source Material Enshrined. Selecting a new file will replace it.
                    </div>
                  )}
                </div>
              ) : (
                <div className="form-group">
                  <label className="label">YouTube Video Identifier</label>
                  <input
                    type="text"
                    name="youtubeVideoId"
                    className="form-control"
                    placeholder="e.g. dQw4w9WgXcQ"
                    value={formData.youtubeVideoId}
                    onChange={handleChange}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff' }}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Enter the unique ID from the YouTube URL (the part after v=)
                  </p>
                </div>
              )}

              {/* AI GENERATION SECTION */}
              <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)', padding: '24px', borderRadius: '16px', border: '1px solid var(--accent-border)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '100px', opacity: 0.05 }}>✨</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: 'var(--accent)', margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>✨</span> Synthetic Architect
                  </h3>
                  <button type="button" onClick={saveApiKey} className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '6px 12px', background: apiKey ? 'var(--bg-tertiary)' : 'transparent', color: apiKey ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {apiKey ? 'Interface Active 🟢' : 'Configure Uplink'}
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                  Leverage advanced neural networks to synthesize comprehensive overviews, structured study notes, and intelligently timed interactive evaluations based on the selected domain parameters.
                </p>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  className="btn btn-primary"
                  style={{ width: '100%', height: '48px', background: 'var(--accent-gradient)', border: 'none', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)', fontWeight: 600, letterSpacing: '0.5px' }}
                  disabled={aiLoading}
                >
                  {aiLoading ? <span className="loader" style={{ width: '20px', height: '20px', borderTopColor: '#fff' }}></span> : "Initialize Synthesis Sequence"}
                </button>
              </div>

              <div className="form-group">
                <label className="label">Executive Summary</label>
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
                <label className="label">Structured Intelligence (Markdown Enabled)</label>
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
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{lectures.length} Total entries</span>
          </div>

          {lectures.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No entries found for the current selection.</div>
          ) : (
            lectures.map(lecture => (
              <div key={lecture.id} className="glass-panel animate-scale-up" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{lecture.grade}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--success)', background: 'rgba(34, 197, 94, 0.1)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{lecture.subject}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--warning)', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: '6px', textTransform: 'uppercase' }}>{lecture.batch || "All"}</span>
                  </div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: 'var(--text-primary)' }}>{lecture.title}</h4>
                  <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LecturesView;
