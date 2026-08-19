import { useState, useEffect, useRef } from 'react';
import noteBg from '../assets/Notes_panel.png';
import checkBtnBg from '../assets/Notes.png';

const STORAGE_KEY = 'atrq_notes_v2';

const MAX_LINES = 25;
const MAX_CHARS = 36;

interface CheckResult {
  status: 'win' | 'lose' | null;
  score: number;
}

function loadNote(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveNote(note: string) {
  try {
    localStorage.setItem(STORAGE_KEY, note);
  } catch {
    // Ignore storage errors
  }
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: '100%',
    width: 420,

    backgroundImage: `url(${noteBg})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',

    zIndex: 100,

    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'monospace',

    boxShadow: '-4px 0 20px rgba(0,0,0,0.6)',
  },

  notesArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },

  input: {
    position: 'absolute',

    left: 55,
    width: 330,

    background: 'transparent',
    border: 'none',
    outline: 'none',

    color: '#556967',
    fontSize: 16,
    fontFamily: 'monospace',

    boxSizing: 'border-box',
    padding: 0,
  },

  progressWrapper: {
    borderBottom: '1px solid #222',
    padding: '8px 14px',
    display: 'flex',
    gap: 8,
    marginBottom: '8px',
  },

  progressBar: {
    flex: 1,
    height: 14,

    background: '#111',
    borderRadius: 3,
    overflow: 'hidden',
    border: '1px solid #222',

    position: 'relative',
  },

  bar: {
    padding: '8px 10px',
    borderTop: '1px solid #2a2a2a',

    display: 'flex',
    justifyContent: 'center',
  },

  btn: {
    width: 150,
    height: 42,

    background: '#062632',
    color: '#d5e3df',

    border: '1px solid #1a4a52',
    borderRadius: 4,

    padding: '0 14px',

    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'monospace',

    cursor: 'pointer',
    letterSpacing: 1.5,

    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,

    position: 'relative',
    zIndex: 101,

    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
  },

  btnDisabled: {
    width: 150,
    height: 42,

    background: '#062632',
    color: '#52615f',

    border: '1px solid #12353b',
    borderRadius: 4,

    padding: '0 14px',

    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'monospace',

    cursor: 'not-allowed',
    letterSpacing: 1.5,

    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,

    position: 'relative',
    zIndex: 101,

    opacity: 0.55,
  }
};

export function NotesPanel() {
  // Exact vertical positions of every notebook line.
  // You can manually tweak individual values if needed.
  const LINE_POSITIONS = [
    104,
    127,
    150,
    173,
    196,
    219,
    242,
    264,
    287,
    310,
    333,
    356,
    379,
    402,
    425,
    448,
    471,
    494,
    517,
    540,
    563,
    586,
    609,
    632,
    655,
  ];

  const [lines, setLines] = useState<string[]>(() => {
    const saved = loadNote();

    if (!saved) {
      return Array(MAX_LINES).fill('');
    }

    const savedLines = saved
      .split('\n')
      .slice(0, MAX_LINES);

    return [
      ...savedLines,
      ...Array(MAX_LINES - savedLines.length).fill(''),
    ];
  });

  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  const checkIdRef = useRef(1);

  const saveTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const inputRefs = useRef<
    Array<HTMLInputElement | null>
  >([]);

  // Convert all notebook lines into one story string
  const body = lines.join('\n');

  const updateLine = (
    index: number,
    value: string
  ) => {
    setLines((previous) => {
      const updated = [...previous];

      updated[index] = value;

      return updated;
    });

    setResult(null);
  };

  // Auto-save notebook
  useEffect(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      saveNote(body);
    }, 400);

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [body]);

  const focusLine = (index: number) => {
    if (index < 0 || index >= MAX_LINES) return;

    const input = inputRefs.current[index];

    if (!input) return;

    input.focus();

    setTimeout(() => {
      input.setSelectionRange(
        input.value.length,
        input.value.length
      );
    }, 0);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) => {
    // ENTER → next line
    if (event.key === 'Enter') {
      event.preventDefault();

      focusLine(index + 1);
      return;
    }

    // BACKSPACE on empty line → previous line
    if (
      event.key === 'Backspace' &&
      lines[index] === '' &&
      index > 0
    ) {
      event.preventDefault();

      focusLine(index - 1);
      return;
    }

    // UP ARROW → previous line
    if (
      event.key === 'ArrowUp' &&
      index > 0
    ) {
      event.preventDefault();

      focusLine(index - 1);
      return;
    }

    // DOWN ARROW → next line
    if (
      event.key === 'ArrowDown' &&
      index < MAX_LINES - 1
    ) {
      event.preventDefault();

      focusLine(index + 1);
    }
  };

  const handleCheckStory = async () => {
    const contents = lines
      .filter((line) => line.trim())
      .join('\n');

    if (!contents.trim()) return;

    setChecking(true);
    setResult(null);

    const progressCheckId =
      checkIdRef.current++;

    try {
      const res = await fetch(
        '/check-story',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            type: 'progress_check',

            progress_check_id:
              progressCheckId,

            contents,
          }),
        }
      );

      const data = await res.json();

      const score =
        data.progress_check_status ?? 0;

      setResult({
        status:
          score >= 70
            ? 'win'
            : 'lose',

        score,
      });
    } catch {
      setResult({
        status: 'lose',
        score: 0,
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={s.panel}>

      {/* NOTEBOOK INPUT AREA */}
      <div style={s.notesArea}>
        {lines.map((line, index) => (
          <input
            key={index}

            ref={(element) => {
              inputRefs.current[index] =
                element;
            }}

            value={line}

            placeholder={
              index === 0
                ? 'Write what you think happened here...'
                : ''
            }

            maxLength={MAX_CHARS}

            onChange={(event) => {
              const value =
                event.target.value;

              updateLine(index, value);

              // Automatically move to the next
              // notebook line when this one is full
              if (
                value.length >= MAX_CHARS &&
                index < MAX_LINES - 1
              ) {
                setTimeout(() => {
                  focusLine(index + 1);
                }, 0);
              }
            }}

            onKeyDown={(event) =>
              handleKeyDown(
                event,
                index
              )
            }

            style={{
              ...s.input,

              top:
                LINE_POSITIONS[index],
            }}
          />
        ))}
      </div>

      {/* CHECK BUTTON */}
      <div style={s.bar}>
        <button
          style={checking || !body.trim() ? s.btnDisabled : s.btn}
          onClick={handleCheckStory}
          disabled={checking || !body.trim()}
        >
          <img
            src={checkBtnBg}
            alt=""
            style={{
              width: 24,
              height: 24,
              objectFit: 'contain',
              imageRendering: 'pixelated',
            }}
          />

          <span>
            {checking ? 'CHECKING' : 'CHECK'}
          </span>
        </button>
      </div>

      {/* PROGRESS BAR */}
      <div style={s.progressWrapper}>
        <div style={s.progressBar}>

          <div
            style={{
              height: '100%',

              width: `${
                result
                  ? result.score
                  : 0
              }%`,

              background:
                result?.status === 'win'
                  ? '#363'
                  : '#444466',

              borderRadius: 2,

              transition:
                'width 0.4s ease',

              imageRendering:
                'pixelated',
            }}
          />

          <span
            style={{
              position: 'absolute',

              inset: 0,

              display: 'flex',

              alignItems: 'center',

              justifyContent:
                'center',

              fontSize: 9,

              fontWeight: 700,
            }}
          >
            {result
              ? `${result.score}%`
              : '— %'}
          </span>

        </div>
      </div>

    </div>
  );
}