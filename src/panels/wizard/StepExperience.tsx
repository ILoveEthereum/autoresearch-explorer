import { useState, useEffect } from 'react';
import type React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface MemoryEntry {
  id: string;
  name: string;
  question: string;
  summary: string;
  skill_doc_path: string | null;
  created_at: string;
}

interface Props {
  question: string;
  selectedSkillPaths: string[];
  setSelectedSkillPaths: (paths: string[]) => void;
}

export function StepExperience({ question, selectedSkillPaths, setSelectedSkillPaths }: Props) {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<MemoryEntry[]>('search_memory', { query: question })
      .then((results) => {
        setEntries(results);
      })
      .catch(() => {
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [question]);

  const togglePath = (path: string) => {
    if (selectedSkillPaths.includes(path)) {
      setSelectedSkillPaths(selectedSkillPaths.filter((p) => p !== path));
    } else {
      setSelectedSkillPaths([...selectedSkillPaths, path]);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <label style={styles.label}>Past Experience</label>
        <p style={styles.hint}>Searching for relevant past sessions...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={styles.container}>
        <label style={styles.label}>Past Experience</label>
        <p style={styles.hint}>
          The agent can learn from past sessions to improve future research.
        </p>
        <div style={styles.empty}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.4 }}>
            <circle cx="16" cy="16" r="14" stroke="#9ca3af" strokeWidth="1.5" />
            <path d="M16 10v6l4 4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={styles.emptyText}>No past experience yet</span>
          <span style={styles.emptyHint}>
            Skill documents will appear here after completing research sessions.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <label style={styles.label}>Past Experience</label>
      <p style={styles.hint}>
        Select past sessions to include as context. The agent will use these to avoid repeating mistakes.
      </p>
      <div style={styles.list}>
        {entries.map((entry) => {
          const path = entry.skill_doc_path;
          if (!path) return null;
          const checked = selectedSkillPaths.includes(path);
          return (
            <label key={entry.id} style={styles.item}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => togglePath(path)}
                style={styles.checkbox}
              />
              <div style={styles.itemContent}>
                <span style={styles.itemName}>{entry.name}</span>
                <span style={styles.itemSummary}>{entry.summary || entry.question}</span>
                <span style={styles.itemDate}>
                  {new Date(entry.created_at).toLocaleDateString()}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: 700,
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#9ca3af',
    margin: 0,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '32px 24px',
    border: '1px dashed #e5e7eb',
    borderRadius: 8,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: 600,
    color: '#6b7280',
  },
  emptyHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center' as const,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 4,
    maxHeight: 240,
    overflowY: 'auto' as const,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  checkbox: {
    marginTop: 2,
    accentColor: '#111827',
  },
  itemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  itemSummary: {
    fontSize: 12,
    color: '#6b7280',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },
  itemDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
};
