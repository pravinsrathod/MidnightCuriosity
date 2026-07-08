import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Clock, Plus, Trash2, Save, X } from 'lucide-react';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function TimetableView({ adminTenantId, grades, batches, subjects, activities, customAlert, customConfirm, db }) {
  const [selectedGrade, setSelectedGrade] = useState(grades?.[0] || '');
  const [selectedBatch, setSelectedBatch] = useState('All');
  const [editMode, setEditMode] = useState('default'); // 'default' | 'override'
  const [selectedWeek, setSelectedWeek] = useState('');
  const [schedule, setSchedule] = useState({});
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!selectedGrade || !adminTenantId) return;
    setFetching(true);
    
    const formattedBatch = selectedBatch === 'All' ? '' : `_${selectedBatch.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const baseDocId = `${adminTenantId}_${selectedGrade}${formattedBatch}`;
    let docIdToListen = baseDocId;
    
    if (editMode === 'override' && selectedWeek) {
      docIdToListen = `${baseDocId}_${selectedWeek}`;
    } else if (editMode === 'override' && !selectedWeek) {
      setSchedule({});
      setFetching(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'timetables', docIdToListen), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSchedule(data.schedule || {});
        if (data.timezone) setTimezone(data.timezone);
        setFetching(false);
      } else {
        if (editMode === 'override') {
          // Prefill with base timetable
          const baseSnap = await getDoc(doc(db, 'timetables', baseDocId));
          if (baseSnap.exists()) {
            setSchedule(baseSnap.data().schedule || {});
            if (baseSnap.data().timezone) setTimezone(baseSnap.data().timezone);
          } else {
            setSchedule({});
          }
        } else {
          setSchedule({});
        }
        setFetching(false);
      }
    });
    return () => unsub();
  }, [selectedGrade, adminTenantId, editMode, selectedWeek, db]);

  const handleAddSlot = (day) => {
    setSchedule(prev => {
      const daySlots = prev[day] || [];
      let startTime = '08:30';
      let endTime = '09:30';

      if (daySlots.length > 0) {
        const lastSlot = daySlots[daySlots.length - 1];
        startTime = lastSlot.endTime || '08:30';
        
        if (startTime) {
          const [h, m] = startTime.split(':');
          const hInt = parseInt(h);
          if (hInt < 23) {
            endTime = `${(hInt + 1).toString().padStart(2, '0')}:${m}`;
          } else {
            endTime = '23:59';
          }
        }
      }

      return {
        ...prev,
        [day]: [...daySlots, { id: crypto.randomUUID(), startTime, endTime, subject: subjects?.[0] || '', type: 'class' }]
      };
    });
  };

  const handleUpdateSlot = (day, index, field, value) => {
    setSchedule(prev => {
      const daySlots = [...(prev[day] || [])];
      let newSlot = { ...daySlots[index], [field]: value };
      
      if (field === 'type') {
        if (value === 'class') newSlot.subject = subjects?.[0] || '';
        else if (value === 'activity') newSlot.subject = activities?.[0] || '';
        else if (value === 'break') newSlot.subject = 'Break';
      }
      
      daySlots[index] = newSlot;
      return { ...prev, [day]: daySlots };
    });
  };

  const handleRemoveSlot = (day, index) => {
    setSchedule(prev => {
      const daySlots = [...(prev[day] || [])];
      daySlots.splice(index, 1);
      return { ...prev, [day]: daySlots };
    });
  };

  const handleSave = async () => {
    if (!selectedGrade) return customAlert("Please select a grade.");
    if (editMode === 'override' && !selectedWeek) return customAlert("Please select a week.");
    
    // Check for overlaps
    for (const day of DAYS) {
      const daySlots = schedule[day];
      if (daySlots && daySlots.length > 1) {
        const sorted = [...daySlots].sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].startTime < sorted[i-1].endTime) {
            return customAlert(`Overlap detected on ${day.charAt(0).toUpperCase() + day.slice(1)} between ${sorted[i-1].endTime} and ${sorted[i].startTime}. Please fix.`);
          }
        }
      }
    }

    setLoading(true);
    try {
      const formattedBatch = selectedBatch === 'All' ? '' : `_${selectedBatch.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const baseDocId = `${adminTenantId}_${selectedGrade}${formattedBatch}`;
      const docId = editMode === 'override' ? `${baseDocId}_${selectedWeek}` : baseDocId;
      
      const payload = {
        tenantId: adminTenantId,
        grade: selectedGrade,
        timezone,
        schedule,
        updatedAt: new Date()
      };
      
      if (editMode === 'override') {
        payload.week = selectedWeek;
        payload.isOverride = true;
      }

      await setDoc(doc(db, 'timetables', docId), payload, { merge: true });
      customAlert("Timetable saved successfully!");
    } catch (e) {
      console.error(e);
      customAlert("Failed to save timetable.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearOverride = async () => {
    if (editMode !== 'override' || !selectedWeek) return;
    if (!window.confirm("Are you sure you want to clear this week's override and revert to the default schedule?")) return;
    
    setLoading(true);
    try {
      const formattedBatch = selectedBatch === 'All' ? '' : `_${selectedBatch.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const docId = `${adminTenantId}_${selectedGrade}${formattedBatch}_${selectedWeek}`;
      await deleteDoc(doc(db, 'timetables', docId));
      customAlert("Override cleared successfully!");
      // The onSnapshot will handle re-fetching the base schedule since the doc was deleted, wait actually onSnapshot might not if it was listening to the override doc. It will trigger with !exists(), which triggers our prefill logic!
    } catch(e) {
      console.error(e);
      customAlert("Failed to clear override.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view-container animate-fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '8px' }}>Class Timetable</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Manage weekly schedules for each grade.</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading || fetching}>
          <Save size={18} />
          {loading ? "Saving..." : "Save Timetable"}
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Select Grade</label>
          <select 
            className="input-field" 
            value={selectedGrade} 
            onChange={(e) => {
              setSelectedGrade(e.target.value);
              setSelectedBatch('All');
            }}
          >
            {grades?.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Select Batch</label>
          <select 
            className="input-field" 
            value={selectedBatch} 
            onChange={(e) => setSelectedBatch(e.target.value)}
          >
            <option value="All">All / General Schedule</option>
            {batches?.[selectedGrade]?.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Copy from Schedule</label>
          <select 
            className="input-field" 
            value=""
            onChange={async (e) => {
              const val = e.target.value;
              if (!val) return;
              const [sourceGrade, sourceBatch] = val.split('___');
              
              const displayName = sourceBatch === 'All' ? `${sourceGrade} (General)` : `${sourceGrade} - ${sourceBatch}`;
              
              if (await customConfirm(`Are you sure you want to copy the timetable from ${displayName}? This will overwrite the current unsaved schedule on your screen.`)) {
                setLoading(true);
                try {
                  const sourceFormattedBatch = sourceBatch === 'All' ? '' : `_${sourceBatch.replace(/[^a-zA-Z0-9]/g, '_')}`;
                  const baseDocId = `${adminTenantId}_${sourceGrade}${sourceFormattedBatch}`;
                  let docIdToFetch = baseDocId;
                  if (editMode === 'override' && selectedWeek) {
                    docIdToFetch = `${baseDocId}_${selectedWeek}`;
                  }
                  
                  const snap = await getDoc(doc(db, 'timetables', docIdToFetch));
                  if (snap.exists()) {
                    setSchedule(snap.data().schedule || {});
                    customAlert(`Schedule copied from ${displayName}. Remember to click Save!`);
                  } else {
                    if (editMode === 'override' && selectedWeek) {
                      const baseSnap = await getDoc(doc(db, 'timetables', baseDocId));
                      if (baseSnap.exists()) {
                        setSchedule(baseSnap.data().schedule || {});
                        customAlert(`No override found for ${displayName} this week. Base schedule copied instead. Remember to save!`);
                      } else {
                        customAlert(`No timetable found for ${displayName}.`);
                      }
                    } else {
                      customAlert(`No timetable found for ${displayName}.`);
                    }
                  }
                } catch (err) {
                  console.error(err);
                  customAlert("Failed to copy timetable.");
                } finally {
                  setLoading(false);
                }
              }
              e.target.value = ""; 
            }}
          >
            <option value="">Select Schedule to Copy...</option>
            {grades?.flatMap(g => {
              const options = [<option key={`${g}___All`} value={`${g}___All`}>{g} (General)</option>];
              if (batches?.[g]) {
                options.push(...batches[g].map(b => <option key={`${g}___${b}`} value={`${g}___${b}`}>{g} - {b}</option>));
              }
              return options;
            }).filter(opt => opt.props.value !== `${selectedGrade}___${selectedBatch}`)}
          </select>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Schedule Mode</label>
          <select 
            className="input-field" 
            value={editMode} 
            onChange={(e) => setEditMode(e.target.value)}
          >
            <option value="default">Default Schedule</option>
            <option value="override">Specific Week Override</option>
          </select>
        </div>

        {editMode === 'override' && (
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Select Week</label>
            <input 
              type="week" 
              className="input-field" 
              value={selectedWeek} 
              onChange={(e) => setSelectedWeek(e.target.value)}
            />
          </div>
        )}

        <div style={{ flex: 1, minWidth: '200px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Institute Timezone</label>
          <input 
            type="text" 
            className="input-field" 
            value={timezone} 
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. Asia/Kolkata"
          />
        </div>
      </div>

      {editMode === 'override' && selectedWeek && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <button className="btn btn-ghost" onClick={handleClearOverride} style={{ color: 'var(--danger)', padding: '8px 16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Trash2 size={16} /> Clear Override
          </button>
        </div>
      )}

      {fetching ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading timetable...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {DAYS.map(day => (
            <div key={day} className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ textTransform: 'capitalize', fontSize: '1.2rem', fontWeight: 600 }}>{day}</h3>
                <button className="btn btn-secondary btn-small" onClick={() => handleAddSlot(day)} style={{ padding: '6px' }}>
                  <Plus size={16} />
                </button>
              </div>

              {(!schedule[day] || schedule[day].length === 0) ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', padding: '12px 0' }}>
                  No slots scheduled.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {schedule[day].map((slot, index) => (
                    <div key={slot.id || index} style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input 
                          type="time" 
                          className="input-field" 
                          style={{ padding: '6px', fontSize: '0.85rem' }} 
                          value={slot.startTime} 
                          onChange={(e) => handleUpdateSlot(day, index, 'startTime', e.target.value)}
                        />
                        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>-</span>
                        <input 
                          type="time" 
                          className="input-field" 
                          style={{ padding: '6px', fontSize: '0.85rem' }} 
                          value={slot.endTime} 
                          onChange={(e) => handleUpdateSlot(day, index, 'endTime', e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {slot.type === 'class' && (
                          <select 
                            className="input-field" 
                            style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }} 
                            value={slot.subject}
                            onChange={(e) => handleUpdateSlot(day, index, 'subject', e.target.value)}
                          >
                            {(!subjects || subjects.length === 0) && !slot.subject && <option value="">No Subjects Available</option>}
                            {subjects?.map(s => <option key={s} value={s}>{s}</option>)}
                            {slot.subject && !subjects?.includes(slot.subject) && (
                              <option key={slot.subject} value={slot.subject}>{slot.subject} (Legacy)</option>
                            )}
                          </select>
                        )}
                        {slot.type === 'activity' && (
                          <select 
                            className="input-field" 
                            style={{ flex: 1, padding: '8px', fontSize: '0.9rem' }} 
                            value={slot.subject}
                            onChange={(e) => handleUpdateSlot(day, index, 'subject', e.target.value)}
                          >
                            {(!activities || activities.length === 0) && !slot.subject && <option value="">No Activities Available</option>}
                            {activities?.map(a => <option key={a} value={a}>{a}</option>)}
                            {slot.subject && !activities?.includes(slot.subject) && (
                              <option key={slot.subject} value={slot.subject}>{slot.subject} (Legacy)</option>
                            )}
                          </select>
                        )}
                        {slot.type === 'break' && (
                          <div style={{ flex: 1, padding: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>Break Time</div>
                        )}
                        <select 
                          className="input-field" 
                          style={{ width: '100px', padding: '8px', fontSize: '0.9rem' }}
                          value={slot.type}
                          onChange={(e) => handleUpdateSlot(day, index, 'type', e.target.value)}
                        >
                          <option value="class">Class</option>
                          <option value="break">Break</option>
                          <option value="activity">Activity</option>
                        </select>
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: '8px', color: 'var(--danger)' }}
                          onClick={() => handleRemoveSlot(day, index)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {(slot.type === 'class' || slot.type === 'activity') && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <input 
                            type="text"
                            className="input-field"
                            placeholder="Instructor (Optional)"
                            style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                            value={slot.instructor || ''}
                            onChange={(e) => handleUpdateSlot(day, index, 'instructor', e.target.value)}
                          />
                          <input 
                            type="text"
                            className="input-field"
                            placeholder="Room (Optional)"
                            style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                            value={slot.room || ''}
                            onChange={(e) => handleUpdateSlot(day, index, 'room', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
