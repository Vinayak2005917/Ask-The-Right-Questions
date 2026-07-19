import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'atrq_notes_v2';

interface Note {
  id: string;
  title: string;
  body: string;
  timestamp: number;
}

interface CheckResult {
  status: 'win' | 'lose' | null;
  score: number;
}

function loadNotes(): Note[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

interface NotesPanelProps {
  open: boolean;
  onClose: () => void;
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute', top: 0, right: 0, height: '100%', width: 300,
    background: '#1a1a1e', borderLeft: '1px solid #333', zIndex: 100,
    display: 'flex', flexDirection: 'column', fontFamily: 'monospace',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.6)',
  },
  header: {
    padding: '10px 14px', borderBottom: '1px solid #2a2a2a',
    color: '#8888cc', fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
  },
  titleInput: {
    width: '100%', padding: '10px 14px', border: 'none', borderBottom: '1px solid #2a2a2a',
    background: '#141418', color: '#ccc', fontSize: 13, fontFamily: 'monospace',
    outline: 'none',
  },
  textarea: {
    width: '100%', flex: 1, background: '#121216', border: 'none',
    padding: '14px', color: '#bbb', fontSize: 12, fontFamily: 'monospace',
    resize: 'none', outline: 'none', lineHeight: 1.7,
  },
  bar: {
    padding: '8px 10px', borderTop: '1px solid #2a2a2a',
    display: 'flex', gap: 6, flexWrap: 'wrap' as const,
  },
  btn: {
    flex: 1, minWidth: 60,
    background: '#2a2a2a', color: '#ccc', border: '1px solid #444',
    borderRadius: 4, padding: '7px 0', fontSize: 10, fontFamily: 'monospace',
    cursor: 'pointer', letterSpacing: 1,
  },
  btnDisabled: {
    flex: 1, minWidth: 60,
    background: '#1a1a1a', color: '#555', border: '1px solid #333',
    borderRadius: 4, padding: '7px 0', fontSize: 10, fontFamily: 'monospace',
    cursor: 'not-allowed', letterSpacing: 1,
  },
  list: {
    maxHeight: 140, overflowY: 'auto' as const, borderBottom: '1px solid #222',
    background: '#111114',
  },
  listItem: {
    padding: '7px 14px', borderBottom: '1px solid #1e1e22', cursor: 'pointer',
    fontSize: 11, color: '#888',
    display: 'flex', justifyContent: 'space-between' as const, alignItems: 'center',
  },
  resultBox: {
    padding: '6px 10px', borderRadius: 4, fontSize: 11, textAlign: 'center' as const, fontWeight: 600,
  },
};

export function NotesPanel({ open, onClose }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>(() => loadNotes());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const checkIdRef = useRef(1);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Persist note list
  useEffect(() => { saveNotes(notes); }, [notes]);

  // Debounced auto-save current note body/title
  useEffect(() => {
    if (!currentId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setNotes(prev => prev.map(n => n.id === currentId ? { ...n, title, body } : n));
    }, 400);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, body, currentId]);

  const selectNote = useCallback((note: Note) => {
    setCurrentId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setResult(null);
  }, []);

  const newNote = useCallback(() => {
    const note: Note = { id: genId(), title: '', body: '', timestamp: Date.now() };
    setNotes(prev => [note, ...prev]);
    selectNote(note);
  }, [selectNote]);

  const deleteNote = useCallback(() => {
    if (!currentId) return;
    setNotes(prev => prev.filter(n => n.id !== currentId));
    setCurrentId(null);
    setTitle('');
    setBody('');
    setResult(null);
  }, [currentId]);

  const handleCheckStory = async () => {
    if (!body.trim()) return;
    setChecking(true);
    setResult(null);
    const progressCheckId = checkIdRef.current++;
    try {
      const res = await fetch('/check-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'progress_check',
          progress_check_id: progressCheckId,
          contents: body,
        }),
      });
      const data = await res.json();
      const score = data.progress_check_status ?? 0;
      setResult({ status: score >= 70 ? 'win' : 'lose', score });
    } catch {
      setResult({ status: 'lose', score: 0 });
    } finally {
      setChecking(false);
    }
  };

  const currentNote = notes.find(n => n.id === currentId);

  if (!open) return null;

  return (
    <div style={s.panel}>
      <div style={s.header}>📓 NOTES</div>

          {/* Saved notes list */}
          <div style={s.list}>
            {notes.length === 0 && (
              <div style={{ padding: 14, color: '#555', fontSize: 11, textAlign: 'center' }}>empty</div>
            )}
            {notes.map(n => (
              <div
                key={n.id}
                style={{
                  ...s.listItem,
                  background: n.id === currentId ? '#1e1e2a' : undefined,
                }}
                onClick={() => selectNote(n)}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {n.title || '(untitled)'}
                </span>
                <span style={{ color: '#555', fontSize: 9, marginLeft: 8 }}>
                  {new Date(n.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ borderBottom: '1px solid #222', padding: '8px 14px', display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, height: 14, background: '#111', borderRadius: 3, overflow: 'hidden', border: '1px solid #222', position: 'relative' }}>
              <div style={{ height: '100%', width: `${result ? result.score : 0}%`, background: result?.status === 'win' ? '#363' : '#444466', borderRadius: 2, transition: 'width 0.4s ease' }} />
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                {result ? `${result.score}%` : '— %'}
              </span>
            </div>
          </div>

          {/* Title */}
          <input
            style={s.titleInput}
            placeholder="note title..."
            value={title}
            onChange={e => { setTitle(e.target.value); setResult(null); }}
          />

          {/* Body */}
          <textarea
            style={s.textarea}
            placeholder="write a note..."
            value={body}
            onChange={e => { setBody(e.target.value); setResult(null); }}
          />

          {/* Actions */}
          <div style={s.bar}>
            <button style={s.btn} onClick={newNote}>+ NEW</button>
            <button style={currentNote ? s.btn : s.btnDisabled} onClick={deleteNote} disabled={!currentNote}>DEL</button>
            <button
              style={checking || !body.trim() ? s.btnDisabled : s.btn}
              onClick={handleCheckStory}
              disabled={checking || !body.trim()}
            >
              {checking ? '◇' : '◈'} CHECK
            </button>
          </div>
      </div>
  );
}
