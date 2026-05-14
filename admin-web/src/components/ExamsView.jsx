import React, { useState } from 'react';
import Pagination from './common/Pagination';

const ExamsView = ({ 
  exams, 
  examForm, 
  setExamForm, 
  examFile, 
  setExamFile, 
  isProcessingExam, 
  loading, 
  grades, 
  batches, 
  subjects, 
  topics, 
  handleExamFileChange, 
  processExamPdf, 
  saveExam, 
  deleteExam, 
  customAlert 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  
  const displayedExams = exams.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  return (
    <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div className="glass-panel" style={{ marginBottom: '40px', padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h2 style={{ fontSize: '1.75rem', margin: 0 }}>📋 Schedule Assessment</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0' }}>Configure exam parameters and upload repositories.</p>
          </div>
          <div style={{ padding: '8px 16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
            A.I. Assisted Extract
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '24px' }}>
            <div className="form-group">
              <label className="label">Target Level</label>
              <select 
                className="form-control"
                value={examForm.grade} 
                onChange={e => {
                  const newGrade = e.target.value;
                  setExamForm(prev => ({ ...prev, grade: newGrade, batch: "All" }));
                }} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="">Select Level</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Target Group (Batch)</label>
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
              <label className="label">Quota (Minutes)</label>
              <input 
                type="number" 
                className="form-control" 
                value={examForm.duration} 
                onChange={e => setExamForm(prev => ({ ...prev, duration: parseInt(e.target.value) }))} 
                placeholder="60" 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 350px), 1fr))', gap: '24px' }}>
            <div className="form-group">
              <label className="label">Assessment Title</label>
              <input 
                type="text" 
                className="form-control" 
                value={examForm.title} 
                onChange={e => setExamForm(prev => ({ ...prev, title: e.target.value }))} 
                placeholder="e.g. Quantum Mechanics Final" 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} 
              />
            </div>
            <div className="form-group">
              <label className="label">Scheduled Window</label>
              <input 
                type="datetime-local" 
                className="form-control" 
                value={examForm.date} 
                onChange={e => setExamForm(prev => ({ ...prev, date: e.target.value }))} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }} 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '24px' }}>
            <div className="form-group">
              <label className="label">Subject domain</label>
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
              <label className="label">Specific Unit (Optional)</label>
              <select 
                className="form-control"
                value={examForm.topic} 
                onChange={e => setExamForm(prev => ({ ...prev, topic: e.target.value }))} 
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: '#fff', padding: '12px', borderRadius: '10px', width: '100%' }}
              >
                <option value="">Select Focus Area</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div style={{ border: '2px dashed var(--accent-border)', background: 'rgba(59, 130, 246, 0.02)', padding: '40px 20px', borderRadius: '16px', textAlign: 'center', transition: 'all 0.3s ease' }}>
            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>📄</div>
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px' }}>Assessment Repository Upload</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>Drop your PDF question paper here for AI analysis.</p>
            <input type="file" accept="application/pdf" onChange={handleExamFileChange} style={{ marginBottom: '24px' }} />

            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
              <button className="btn btn-primary" onClick={processExamPdf} disabled={isProcessingExam || !examFile} style={{ height: '48px', padding: '0 24px' }}>
                {isProcessingExam ? '⚡ Analyzing Corpus...' : '✨ Extract Questions'}
              </button>
              <button className="btn btn-ghost" onClick={() => {
                const mockQuestions = [
                  { question: "What is the unit of Force?", options: ["Joule", "Newton", "Watt", "Pascal"], correctAnswer: 1 },
                  { question: "Kinetic Energy formula?", options: ["mv", "1/2 mv^2", "mgh", "ma"], correctAnswer: 1 },
                  { question: "Value of g on Earth?", options: ["9.8 m/s^2", "10 m/s", "8.9 m/s^2", "0"], correctAnswer: 0 }
                ];
                setExamForm(prev => ({ ...prev, questions: mockQuestions }));
                customAlert("Loaded Mock Questions for Testing!");
              }} style={{ height: '48px' }}>
                🛠️ Manual Seed
              </button>
            </div>
          </div>

          {examForm.questions.length > 0 && (
            <div className="animate-fade-in" style={{ background: 'rgba(0,0,0,0.2)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                Parsed Directives <span>{examForm.questions.length} Questions</span>
              </h4>
              <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '10px' }}>
                {examForm.questions.map((q, i) => (
                  <div key={i} style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>{i + 1}. {q.question}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '10px' }}>
                      {q.options.map((opt, idx) => (
                        <div key={idx} style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          background: idx === q.correctAnswer ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255,255,255,0.03)',
                          border: idx === q.correctAnswer ? '1px solid var(--success-border)' : '1px solid transparent',
                          color: idx === q.correctAnswer ? 'var(--success)' : 'var(--text-secondary)'
                        }}>
                          <span style={{ marginRight: '8px', fontWeight: 800 }}>{String.fromCharCode(65 + idx)}</span> {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary" onClick={saveExam} disabled={loading || examForm.questions.length === 0} style={{ alignSelf: 'flex-start', padding: '14px 40px', fontSize: '1.1rem', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.4)' }}>
            {loading ? 'Committing...' : '💾 Finalize & Publish'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Active Assessments</h3>
        <div style={{ height: '1px', flex: 1, background: 'var(--border)' }}></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px' }}>
        {exams.length === 0 ? (
          <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No assessments currently scheduled.</div>
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
                <span>⚙️ {exam.questions.length} Items • {exam.duration} Minutes • {exam.subject}</span>
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
