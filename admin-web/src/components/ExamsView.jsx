import React, { useState, useRef } from 'react';
import Pagination from './common/Pagination';

const EMPTY_QUESTION = { 
  question: '', 
  questionImageFile: null,
  questionImagePreview: null,
  options: [
    { text: '', imageFile: null, imagePreview: null }, 
    { text: '', imageFile: null, imagePreview: null }, 
    { text: '', imageFile: null, imagePreview: null }, 
    { text: '', imageFile: null, imagePreview: null }
  ], 
  correctAnswer: 0 
};

const ExamsView = ({ 
  exams, 
  examForm, 
  setExamForm, 
  loading, 
  grades, 
  batches, 
  subjects, 
  topics, 
  saveExam, 
  deleteExam, 
  customAlert 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(null);
  const pageSize = 10;
  
  const displayedExams = exams.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const addQuestion = () => {
    setExamForm(prev => ({
      ...prev,
      questions: [...prev.questions, { 
        ...EMPTY_QUESTION, 
        options: [
          { text: '', imageFile: null, imagePreview: null }, 
          { text: '', imageFile: null, imagePreview: null }, 
          { text: '', imageFile: null, imagePreview: null }, 
          { text: '', imageFile: null, imagePreview: null }
        ] 
      }]
    }));
    setEditingQuestionIndex(examForm.questions.length);
  };

  const updateQuestion = (index, field, value) => {
    setExamForm(prev => {
      const updated = [...prev.questions];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, questions: updated };
    });
  };

  const handleQuestionImageChange = (qIndex, e) => {
    const file = e.target.files[0];
    if (file) {
      setExamForm(prev => {
        const updated = [...prev.questions];
        updated[qIndex] = { 
          ...updated[qIndex], 
          questionImageFile: file,
          questionImagePreview: URL.createObjectURL(file)
        };
        return { ...prev, questions: updated };
      });
    }
    e.target.value = '';
  };

  const removeQuestionImage = (qIndex) => {
    setExamForm(prev => {
      const updated = [...prev.questions];
      updated[qIndex] = { 
        ...updated[qIndex], 
        questionImageFile: null,
        questionImagePreview: null,
        questionImage: null // Remove existing URL if any
      };
      return { ...prev, questions: updated };
    });
  };

  const updateOptionText = (qIndex, optIndex, value) => {
    setExamForm(prev => {
      const updated = [...prev.questions];
      const newOptions = [...updated[qIndex].options];
      newOptions[optIndex] = { ...newOptions[optIndex], text: value };
      updated[qIndex] = { ...updated[qIndex], options: newOptions };
      return { ...prev, questions: updated };
    });
  };

  const handleOptionImageChange = (qIndex, optIndex, e) => {
    const file = e.target.files[0];
    if (file) {
      setExamForm(prev => {
        const updated = [...prev.questions];
        const newOptions = [...updated[qIndex].options];
        newOptions[optIndex] = {
          ...newOptions[optIndex],
          imageFile: file,
          imagePreview: URL.createObjectURL(file)
        };
        updated[qIndex] = { ...updated[qIndex], options: newOptions };
        return { ...prev, questions: updated };
      });
    }
    e.target.value = '';
  };

  const removeOptionImage = (qIndex, optIndex) => {
    setExamForm(prev => {
      const updated = [...prev.questions];
      const newOptions = [...updated[qIndex].options];
      newOptions[optIndex] = {
        ...newOptions[optIndex],
        imageFile: null,
        imagePreview: null,
        image: null // Remove existing URL if any
      };
      updated[qIndex] = { ...updated[qIndex], options: newOptions };
      return { ...prev, questions: updated };
    });
  };

  const removeQuestion = (index) => {
    setExamForm(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }));
    if (editingQuestionIndex === index) setEditingQuestionIndex(null);
    else if (editingQuestionIndex > index) setEditingQuestionIndex(editingQuestionIndex - 1);
  };

  const isQuestionComplete = (q) => {
    return q.question.trim() && q.options.every(opt => opt.text.trim() || opt.imageFile || opt.image);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* ── Create Exam Form ── */}
      <div className="glass-panel" style={{ marginBottom: '40px', padding: '32px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.6rem', margin: '0 0 4px' }}>📝 Create Exam</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Set up the exam details and add questions manually.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Row 1: Title & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
            <div className="form-group">
              <label className="label">Exam Title</label>
              <input 
                type="text" 
                className="form-control" 
                value={examForm.title} 
                onChange={e => setExamForm(prev => ({ ...prev, title: e.target.value }))} 
                placeholder="e.g. Mid-Term Physics Test" 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} 
              />
            </div>
            <div className="form-group">
              <label className="label">Date & Time</label>
              <input 
                type="datetime-local" 
                className="form-control" 
                value={examForm.date} 
                onChange={e => setExamForm(prev => ({ ...prev, date: e.target.value }))} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} 
              />
            </div>
          </div>

          {/* Row 2: Grade, Batch, Duration */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '20px' }}>
            <div className="form-group">
              <label className="label">Class</label>
              <select 
                className="form-control"
                value={examForm.grade} 
                onChange={e => {
                  const newGrade = e.target.value;
                  setExamForm(prev => ({ ...prev, grade: newGrade, batch: "All" }));
                }} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="">Select Class</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Batch</label>
              <select 
                className="form-control"
                value={examForm.batch} 
                onChange={e => setExamForm(prev => ({ ...prev, batch: e.target.value }))} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="All">All Batches</option>
                {(batches[examForm.grade] || ["General Batch"]).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Duration (min)</label>
              <input 
                type="number" 
                className="form-control" 
                value={examForm.duration} 
                onChange={e => setExamForm(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))} 
                placeholder="60" 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} 
              />
            </div>
          </div>

          {/* Row 3: Subject & Topic */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
            <div className="form-group">
              <label className="label">Subject</label>
              <select 
                className="form-control"
                value={examForm.subject} 
                onChange={e => setExamForm(prev => ({ ...prev, subject: e.target.value }))} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="">Select Subject</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Topic (Optional)</label>
              <select 
                className="form-control"
                value={examForm.topic} 
                onChange={e => setExamForm(prev => ({ ...prev, topic: e.target.value }))} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="">Select Topic</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* ── Questions Section ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>
                Questions
                {examForm.questions.length > 0 && (
                  <span style={{ 
                    marginLeft: '10px', 
                    fontSize: '0.8rem', 
                    fontWeight: 500, 
                    color: 'var(--text-secondary)',
                    background: 'rgba(255,255,255,0.05)', 
                    padding: '3px 10px', 
                    borderRadius: '20px' 
                  }}>
                    {examForm.questions.length} added
                  </span>
                )}
              </h3>
              <button 
                className="btn btn-ghost" 
                onClick={addQuestion} 
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem',
                  padding: '8px 16px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Question
              </button>
            </div>

            {examForm.questions.length === 0 ? (
              <div style={{ 
                border: '2px dashed var(--border)', 
                borderRadius: '14px', 
                padding: '48px 24px', 
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px', opacity: 0.5 }}>📋</div>
                <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text-primary)' }}>No questions yet</p>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Click "Add Question" above to start building your exam.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '600px', overflowY: 'auto', paddingRight: '4px' }}>
                {examForm.questions.map((q, i) => {
                  const qImagePreview = q.questionImagePreview || q.questionImage;
                  return (
                  <div 
                    key={i} 
                    style={{ 
                      padding: '16px 20px', 
                      background: editingQuestionIndex === i ? 'rgba(59, 130, 246, 0.06)' : 'var(--bg-input)', 
                      borderRadius: '12px', 
                      border: editingQuestionIndex === i ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Question Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '12px' }}>
                      <span style={{ 
                        background: 'rgba(59, 130, 246, 0.15)', 
                        color: 'var(--accent)', 
                        fontWeight: 700, 
                        fontSize: '0.75rem', 
                        padding: '3px 10px', 
                        borderRadius: '6px',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}>
                        Q{i + 1}
                      </span>

                      {editingQuestionIndex === i ? (
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={q.question}
                              onChange={e => updateQuestion(i, 'question', e.target.value)}
                              placeholder="Type your question here..."
                              autoFocus
                              style={{ 
                                flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', 
                                color: '#fff', padding: '10px 14px', borderRadius: '8px', fontSize: '0.95rem',
                                fontWeight: 500
                              }}
                            />
                            <label 
                              style={{ 
                                cursor: 'pointer', padding: '10px', background: 'rgba(255,255,255,0.05)', 
                                borderRadius: '8px', border: '1px solid var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}
                              title="Add image to question"
                            >
                              <input 
                                type="file" accept="image/*" 
                                style={{ display: 'none' }} 
                                onChange={e => handleQuestionImageChange(i, e)} 
                              />
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            </label>
                          </div>
                          
                          {qImagePreview && (
                            <div style={{ marginTop: '12px', position: 'relative', display: 'inline-block' }}>
                              <img src={qImagePreview} alt="Question" style={{ height: '100px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                              <button 
                                onClick={() => removeQuestionImage(i)}
                                style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div 
                          onClick={() => setEditingQuestionIndex(i)} 
                          style={{ flex: 1, cursor: 'pointer' }}
                        >
                          <div style={{ 
                            fontWeight: 500, 
                            color: q.question ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontSize: '0.95rem', lineHeight: 1.4
                          }}>
                            {q.question || 'Click to edit question...'}
                          </div>
                          {qImagePreview && (
                            <img src={qImagePreview} alt="Question" style={{ height: '60px', marginTop: '8px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => setEditingQuestionIndex(editingQuestionIndex === i ? null : i)}
                          className="btn btn-ghost"
                          style={{ padding: '6px', color: 'var(--text-secondary)' }}
                          title={editingQuestionIndex === i ? "Done editing" : "Edit question"}
                        >
                          {editingQuestionIndex === i ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          )}
                        </button>
                        <button
                          onClick={() => removeQuestion(i)}
                          className="btn btn-ghost"
                          style={{ padding: '6px', color: 'var(--danger)' }}
                          title="Remove question"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </div>

                    {/* Options */}
                    {editingQuestionIndex === i ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '10px', marginTop: '4px' }}>
                        {q.options.map((opt, idx) => {
                          const optImagePreview = opt.imagePreview || opt.image;
                          return (
                          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => updateQuestion(i, 'correctAnswer', idx)}
                              style={{
                                width: '28px', height: '28px', borderRadius: '50%', border: 'none',
                                background: idx === q.correctAnswer ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                                color: idx === q.correctAnswer ? '#fff' : 'var(--text-secondary)',
                                fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, transition: 'all 0.15s ease', marginTop: '4px'
                              }}
                              title={idx === q.correctAnswer ? 'Correct answer' : 'Mark as correct'}
                            >
                              {String.fromCharCode(65 + idx)}
                            </button>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={e => updateOptionText(i, idx, e.target.value)}
                                  placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                  style={{ 
                                    flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', 
                                    color: '#fff', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem' 
                                  }}
                                />
                                <label 
                                  style={{ 
                                    cursor: 'pointer', padding: '8px', background: 'rgba(255,255,255,0.05)', 
                                    borderRadius: '8px', border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                  }}
                                  title="Add image to option"
                                >
                                  <input 
                                    type="file" accept="image/*" 
                                    style={{ display: 'none' }} 
                                    onChange={e => handleOptionImageChange(i, idx, e)} 
                                  />
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                </label>
                              </div>
                              {optImagePreview && (
                                <div style={{ position: 'relative', alignSelf: 'flex-start' }}>
                                  <img src={optImagePreview} alt={`Option ${String.fromCharCode(65 + idx)}`} style={{ height: '60px', borderRadius: '6px', border: '1px solid var(--border)' }} />
                                  <button 
                                    onClick={() => removeOptionImage(i, idx)}
                                    style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )})}
                        <p style={{ gridColumn: '1/-1', margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Click a letter circle to mark it as the correct answer.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '8px' }}>
                        {q.options.map((opt, idx) => {
                          const optImagePreview = opt.imagePreview || opt.image;
                          return (
                          <div key={idx} style={{
                            padding: '7px 12px',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            background: idx === q.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                            border: idx === q.correctAnswer ? '1px solid var(--success-border)' : '1px solid transparent',
                            color: idx === q.correctAnswer ? 'var(--success)' : 'var(--text-secondary)',
                            display: 'flex', flexDirection: 'column', gap: '6px'
                          }}>
                            <div>
                              <span style={{ marginRight: '8px', fontWeight: 800 }}>{String.fromCharCode(65 + idx)}</span> 
                              {opt.text || '—'}
                            </div>
                            {optImagePreview && (
                              <img src={optImagePreview} alt={`Option ${String.fromCharCode(65 + idx)}`} style={{ height: '40px', alignSelf: 'flex-start', borderRadius: '4px', border: '1px solid var(--border)' }} />
                            )}
                          </div>
                        )})}
                      </div>
                    )}

                    {/* Validation hint */}
                    {editingQuestionIndex !== i && !isQuestionComplete(q) && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--danger)', opacity: 0.8 }}>
                        ⚠ Incomplete — click edit to fill in missing fields.
                      </p>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>

          {/* Save Button */}
          <button 
            className="btn btn-primary" 
            onClick={saveExam} 
            disabled={loading || examForm.questions.length === 0} 
            style={{ 
              alignSelf: 'flex-start', padding: '14px 36px', fontSize: '1rem', 
              boxShadow: '0 8px 16px rgba(59, 130, 246, 0.4)',
              opacity: examForm.questions.length === 0 ? 0.5 : 1
            }}
          >
            {loading ? 'Saving...' : '💾 Publish Exam'}
          </button>
        </div>
      </div>

      {/* ── Active Exams List ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <h3 style={{ margin: 0, fontSize: '1.4rem' }}>Scheduled Exams</h3>
        <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px' }}>
        {exams.length === 0 ? (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No exams scheduled yet.</div>
        ) : (
          <>
            {displayedExams.map(exam => (
          <div key={exam.id} className="glass-panel animate-scale-up" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'transform 0.2s ease' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>PUBLISHED</span>
                <h4 style={{ margin: 0, fontSize: '1.2rem' }}>{exam.title}</h4>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>🗓️ {new Date(exam.date).toLocaleString()}</span>
                <span>⚙️ {exam.questions.length} Questions • {exam.duration} min • {exam.subject}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>🎯 {exam.batch || "All"}</span>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ color: 'var(--danger)', padding: '12px' }} onClick={() => deleteExam(exam.id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            </button>
          </div>
        ))}
          
        {exams.length > 0 && (
          <div style={{ gridColumn: '1/-1' }}>
            <Pagination 
              currentPage={currentPage}
              totalItems={exams.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </>
        )}
      </div>
    </div>
  );
};

export default ExamsView;
