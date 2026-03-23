import { useState, useEffect } from 'react';
import type React from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { TemplateSummary } from '../../types/template';
import { useCanvasStore } from '../../stores/canvasStore';
import { useSessionStore } from '../../stores/sessionStore';

import { StepQuestion } from './StepQuestion';
import { StepSuccess } from './StepSuccess';
import { StepApproach, approachToTemplate } from './StepApproach';
import { StepWorkingDir } from './StepWorkingDir';
import { StepModel } from './StepModel';
import { StepExperience } from './StepExperience';

const TOTAL_STEPS = 6;
const STEP_TITLES = [
  'Research Question',
  'Success Criteria',
  'Approach',
  'Working Directory',
  'Model & API',
  'Experience',
];

interface Props {
  onClose: () => void;
}

export function WizardShell({ onClose }: Props) {
  const [step, setStep] = useState(0);

  // Wizard state
  const [question, setQuestion] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [approach, setApproach] = useState('explore');
  const [maxLoops, setMaxLoops] = useState(50);
  const [workingDir, setWorkingDir] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('qwen/qwen-2.5-72b-instruct');

  const [selectedSkillPaths, setSelectedSkillPaths] = useState<string[]>([]);

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSession = useSessionStore((s) => s.setSession);

  // Load saved values & templates
  useEffect(() => {
    invoke<TemplateSummary[]>('list_templates')
      .then(setTemplates)
      .catch(() => setTemplates([]));

    const savedKey = localStorage.getItem('openrouter_api_key');
    if (savedKey) setApiKey(savedKey);
    const savedModel = localStorage.getItem('openrouter_model');
    if (savedModel) setModel(savedModel);
    const savedDir = localStorage.getItem('working_dir');
    if (savedDir) setWorkingDir(savedDir);
  }, []);

  // Validation per step
  const isStepValid = (s: number): boolean => {
    switch (s) {
      case 0: return question.trim().length > 0;
      case 1: return true; // success criteria is optional
      case 2: return approach.length > 0;
      case 3: return workingDir.trim().length > 0;
      case 4: return apiKey.trim().length > 0 && model.length > 0;
      case 5: return true; // placeholder step
      default: return false;
    }
  };

  const canGoNext = isStepValid(step);
  const isLastStep = step === TOTAL_STEPS - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleStart();
    } else {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleStart = async () => {
    // Resolve template path
    const templateName = approachToTemplate(approach);
    const template = templates.find((t) =>
      t.path.includes(templateName)
    );
    if (!template) {
      setError('Could not find template for selected approach');
      return;
    }

    setLoading(true);
    setError(null);

    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', model);
    if (workingDir) localStorage.setItem('working_dir', workingDir);

    useCanvasStore.getState().applyOps([]);
    useCanvasStore.setState({ nodes: [], edges: [], clusters: [], focusNodeId: null });

    try {
      const meta = await invoke<{ id: string; name: string }>('create_session', {
        name: question.slice(0, 50),
        templatePath: template.path,
        question,
        apiKey,
        model,
        workingDir,
        successCriteria,
        maxLoops,
        pastExperience: selectedSkillPaths.length > 0 ? selectedSkillPaths : null,
      });

      setSession(meta.id, meta.name);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return <StepQuestion question={question} setQuestion={setQuestion} />;
      case 1:
        return <StepSuccess successCriteria={successCriteria} setSuccessCriteria={setSuccessCriteria} />;
      case 2:
        return <StepApproach approach={approach} setApproach={setApproach} maxLoops={maxLoops} setMaxLoops={setMaxLoops} />;
      case 3:
        return <StepWorkingDir workingDir={workingDir} setWorkingDir={setWorkingDir} />;
      case 4:
        return <StepModel apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} />;
      case 5:
        return <StepExperience question={question} selectedSkillPaths={selectedSkillPaths} setSelectedSkillPaths={setSelectedSkillPaths} />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>New Research Session</h2>
            <p style={styles.subtitle}>Step {step + 1} of {TOTAL_STEPS} — {STEP_TITLES[step]}</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Progress dots */}
        <div style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: i <= step ? '#111827' : '#e5e7eb',
              }}
            />
          ))}
        </div>

        <div style={styles.divider} />

        {/* Step content */}
        <div style={styles.content}>
          {renderStep()}
        </div>

        {error && (
          <div style={styles.error}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="7" cy="7" r="6" stroke="#dc2626" strokeWidth="1.2" />
              <path d="M7 4v3.5M7 9.5v.01" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div style={styles.divider} />

        {/* Footer */}
        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <div style={styles.footerRight}>
            {step > 0 && (
              <button style={styles.backBtn} onClick={handleBack} disabled={loading}>
                Back
              </button>
            )}
            <button
              style={{
                ...styles.nextBtn,
                ...(!canGoNext || loading ? styles.nextBtnDisabled : {}),
              }}
              disabled={!canGoNext || loading}
              onClick={handleNext}
            >
              {loading ? (
                <span style={styles.loadingInner}>
                  <span style={styles.spinner} />
                  Starting...
                </span>
              ) : isLastStep ? (
                'Start Research'
              ) : (
                'Next'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: 500,
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.05)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 24px 0',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#9ca3af',
  },
  closeBtn: {
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    display: 'flex',
    gap: 6,
    justifyContent: 'center',
    padding: '16px 24px 0',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'background 0.2s',
  },
  divider: {
    height: 1,
    background: '#f3f4f6',
    margin: '16px 0',
  },
  content: {
    padding: '0 24px',
    minHeight: 180,
  },
  error: {
    margin: '0 24px',
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    fontSize: 12,
    color: '#dc2626',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    lineHeight: '1.4',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 24px 24px',
  },
  footerRight: {
    display: 'flex',
    gap: 10,
  },
  cancelBtn: {
    padding: '10px 18px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  backBtn: {
    padding: '10px 18px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  nextBtn: {
    padding: '10px 24px',
    border: 'none',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: 'background 0.15s',
    fontFamily: 'inherit',
  },
  nextBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  loadingInner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
    display: 'inline-block',
  },
};
