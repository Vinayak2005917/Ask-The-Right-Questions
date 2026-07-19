import { useState } from 'react';

interface MemoryLogEntry {
  mem_id: number;
  text: string;
  x: number;
  y: number;
}

interface WorldLogEntry {
  id: number;
  text: string;
  x: number;
  y: number;
  connections: number[];
}

interface MemoryLogPanelProps {
  memories: MemoryLogEntry[];
  allMemories: WorldLogEntry[];
  unlockedCount: number;
  totalCount: number;
  onUnlockAll?: () => void;
  tileScale: number;
  onTileScaleChange: (s: number) => void;
  memoryScale: number;
  onMemoryScaleChange: (s: number) => void;
  darkFreq: number;
  onDarkFreqChange: (v: number) => void;
  nodeScale: number;
  onNodeScaleChange: (s: number) => void;
  centralScale: number;
  onCentralScaleChange: (s: number) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    display: 'flex',
    zIndex: 100,
    fontFamily: 'monospace',
    userSelect: 'none',
  },
  toggle: {
    width: 28,
    height: 80,
    marginTop: 80,
    background: '#2a2a2a',
    border: '1px solid #444444',
    borderLeft: 'none',
    borderRadius: '0 6px 6px 0',
    color: '#cccccc',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    writingMode: 'vertical-lr',
    letterSpacing: 2,
    userSelect: 'none',
  },
  panel: {
    width: 300,
    height: '100%',
    background: '#1e1e1e',
    borderRight: '1px solid #444444',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid #333',
    color: '#8888cc',
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: 600,
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  entry: {
    padding: '6px 12px',
    borderBottom: '1px solid #282828',
    fontSize: 11,
    lineHeight: 1.5,
  },
  entryId: {
    color: '#8888cc',
    fontWeight: 600,
  },
  entryText: {
    color: '#aaa',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  entryCoords: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
  },
  empty: {
    padding: 20,
    color: '#555',
    fontSize: 11,
    textAlign: 'center' as const,
  },
};

export function MemoryLogPanel({
  memories,
  allMemories,
  unlockedCount,
  totalCount,
  onUnlockAll,
  tileScale,
  onTileScaleChange,
  memoryScale,
  onMemoryScaleChange,
  darkFreq,
  onDarkFreqChange,
  nodeScale,
  onNodeScaleChange,
  centralScale,
  onCentralScaleChange,
}: MemoryLogPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.container}>
      {open && (
        <div style={styles.panel}>
          <div style={{ ...styles.header, padding: '6px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span>MEMORY LOG ({unlockedCount}/{totalCount})</span>
              <span style={{ flex: 1 }} />
              {onUnlockAll && (
                <span
                  onClick={onUnlockAll}
                  style={{ color: '#66ddff', fontSize: 10, cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}
                  title="Unlock all nodes"
                >
                  UNLOCK ALL
                </span>
              )}
              <span style={{ color: '#666', fontSize: 9 }}>tiles</span>
              <input
                type="range"
                min={1} max={8} step={1}
                value={tileScale}
                onChange={(e) => onTileScaleChange(Number(e.target.value))}
                style={{ width: 48, accentColor: '#8888cc', verticalAlign: 'middle' }}
                title="Tile size"
              />
              <span style={{ color: '#8888cc', fontSize: 10, minWidth: 18 }}>{tileScale}×</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }} />
              <span style={{ color: '#666', fontSize: 9 }}>scale</span>
              <input
                type="range"
                min={1} max={200} step={1}
                value={memoryScale}
                onChange={(e) => onMemoryScaleChange(Number(e.target.value))}
                style={{ width: 48, accentColor: '#66ddff', verticalAlign: 'middle' }}
                title="Coordinate scale"
              />
              <span style={{ color: '#66ddff', fontSize: 10, minWidth: 28 }}>{memoryScale}×</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }} />
              <span style={{ color: '#666', fontSize: 9 }}>dark</span>
              <input
                type="range"
                min={0} max={50} step={1}
                value={darkFreq}
                onChange={(e) => onDarkFreqChange(Number(e.target.value))}
                style={{ width: 48, accentColor: '#884444', verticalAlign: 'middle' }}
                title="Dark tile frequency (%)"
              />
              <span style={{ color: '#aa6666', fontSize: 10, minWidth: 22 }}>{darkFreq}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }} />
              <span style={{ color: '#666', fontSize: 9 }}>nodes</span>
              <input
                type="range"
                min={1} max={8} step={0.5}
                value={nodeScale}
                onChange={(e) => onNodeScaleChange(Number(e.target.value))}
                style={{ width: 48, accentColor: '#88cc88', verticalAlign: 'middle' }}
                title="Node sprite size"
              />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }} />
              <span style={{ color: '#666', fontSize: 9 }}>center</span>
              <input
                type="range"
                min={1} max={10} step={0.5}
                value={centralScale}
                onChange={(e) => onCentralScaleChange(Number(e.target.value))}
                style={{ width: 48, accentColor: '#66ddff', verticalAlign: 'middle' }}
                title="Central node size"
              />
              <span style={{ color: '#66ddff', fontSize: 10, minWidth: 18 }}>{centralScale}×</span>
            </div>
              <span style={{ color: '#88cc88', fontSize: 10, minWidth: 18 }}>{nodeScale}×</span>
            </div>
          </div>
          <div style={styles.list}>
            {totalCount === 0 && (
              <div style={styles.empty}>loading world data…</div>
            )}
            {totalCount > 0 && allMemories.length === 0 && (
              <div style={styles.empty}>no memories loaded</div>
            )}
            {allMemories.map((mem) => (
              <div key={`world-${mem.id}`} style={styles.entry}>
                <div>
                  <span style={styles.entryId}>#{mem.id}</span>{' '}
                  <span style={styles.entryText}>{mem.text || '(empty)'}</span>
                </div>
                <div style={styles.entryCoords}>
                  world: ({mem.x?.toFixed(4) ?? '?'}, {mem.y?.toFixed(4) ?? '?'}) &nbsp;|&nbsp; conn: {mem.connections.length}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        style={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Close memory log' : 'Open memory log'}
      >
        {open ? '▶ LOG' : '◀ LOG'}
      </button>
    </div>
  );
}
