import React, { useState, useEffect, useRef } from 'react';
import { 
  Languages, 
  Play, 
  Sparkles, 
  Copy, 
  Check, 
  Download, 
  History, 
  Trash2, 
  Cpu, 
  Zap, 
  BookOpen, 
  Clock, 
  AlertCircle, 
  Code
} from 'lucide-react';

const SUPPORTED_LANGUAGES = [
  { value: 'Java', label: 'Java' },
  { value: 'Python', label: 'Python' },
  { value: 'JavaScript', label: 'JavaScript' },
  { value: 'TypeScript', label: 'TypeScript' },
  { value: 'C++', label: 'C++' },
  { value: 'C#', label: 'C#' },
  { value: 'Go', label: 'Go' },
  { value: 'Rust', label: 'Rust' },
  { value: 'Ruby', label: 'Ruby' },
  { value: 'PHP', label: 'PHP' },
  { value: 'Swift', label: 'Swift' },
  { value: 'SQL', label: 'SQL' }
];

const LOADING_STEPS = [
  'Initializing CodeMorph AI core...',
  'Analyzing source code structure...',
  'Mapping syntax definitions...',
  'Applying AI translation model...',
  'Refactoring and optimizing code...',
  'Evaluating time and space complexities...',
  'Generating code explanation...',
  'Finalizing translation...'
];

export default function App() {
  // Input State
  const [sourceCode, setSourceCode] = useState('public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}');
  const [sourceLanguage, setSourceLanguage] = useState('Java');
  const [targetLanguage, setTargetLanguage] = useState('Python');
  
  // Options State
  const [optimize, setOptimize] = useState(false);
  const [explain, setExplain] = useState(true);
  const [cleanCode, setCleanCode] = useState(true);
  
  // Output State
  const [translatedCode, setTranslatedCode] = useState('');
  const [explanation, setExplanation] = useState('');
  const [timeComplexity, setTimeComplexity] = useState('');
  const [spaceComplexity, setSpaceComplexity] = useState('');
  const [keyChanges, setKeyChanges] = useState([]);
  
  // App UI State
  const [loading, setLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('explanation');
  const [history, setHistory] = useState([]);
  
  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success'); // success, error
  const [copiedSource, setCopiedSource] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState(false);

  const textareaRef = useRef(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const cachedHistory = localStorage.getItem('codemorph_history');
      if (cachedHistory) {
        setHistory(JSON.parse(cachedHistory));
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    try {
      localStorage.setItem('codemorph_history', JSON.stringify(newHistory));
    } catch (e) {
      console.error('Failed to save history', e);
    }
  };

  // Cycle loader steps when loading
  useEffect(() => {
    let interval;
    if (loading) {
      setLoadingStepIndex(0);
      interval = setInterval(() => {
        setLoadingStepIndex((prev) => {
          if (prev < LOADING_STEPS.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const showToast = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage('');
    }, 4000);
  };

  // Run the translation API call
  const handleTranslate = async () => {
    if (!sourceCode.trim()) {
      showToast('Please enter some code to translate.', 'error');
      return;
    }
    if (sourceLanguage === targetLanguage) {
      showToast('Source and Target languages must be different.', 'error');
      return;
    }

    setLoading(true);
    setTranslatedCode('');
    setExplanation('');
    setTimeComplexity('');
    setSpaceComplexity('');
    setKeyChanges([]);

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceCode,
          sourceLanguage,
          targetLanguage,
          optimize,
          explain,
          cleanCode
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const errorMsg = data.error || 'Server error encountered during translation.';
        showToast(errorMsg, 'error');
        return;
      }

      setTranslatedCode(data.translatedCode || '');
      setExplanation(data.explanation || '');
      setTimeComplexity(data.timeComplexity || 'N/A');
      setSpaceComplexity(data.spaceComplexity || 'N/A');
      setKeyChanges(data.keyChanges || []);
      
      // Auto switch tabs
      if (data.explanation) {
        setActiveTab('explanation');
      } else if (data.keyChanges && data.keyChanges.length > 0) {
        setActiveTab('changes');
      } else {
        setActiveTab('complexity');
      }

      // Add to history list
      const historyItem = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sourceCode,
        sourceLanguage,
        targetLanguage,
        translatedCode: data.translatedCode,
        explanation: data.explanation,
        timeComplexity: data.timeComplexity,
        spaceComplexity: data.spaceComplexity,
        keyChanges: data.keyChanges,
        optimize,
        explain,
        cleanCode
      };

      const updatedHistory = [historyItem, ...history.slice(0, 19)]; // Limit to last 20
      saveHistory(updatedHistory);
      showToast('Translation completed successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to connect to the translation server. Please verify backend is running.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Load history item
  const loadHistoryItem = (item) => {
    setSourceCode(item.sourceCode);
    setSourceLanguage(item.sourceLanguage);
    setTargetLanguage(item.targetLanguage);
    setOptimize(item.optimize);
    setExplain(item.explain);
    setCleanCode(item.cleanCode);
    
    setTranslatedCode(item.translatedCode);
    setExplanation(item.explanation);
    setTimeComplexity(item.timeComplexity);
    setSpaceComplexity(item.spaceComplexity);
    setKeyChanges(item.keyChanges || []);
    showToast('Loaded translation from history.');
  };

  // Delete history item
  const deleteHistoryItem = (e, id) => {
    e.stopPropagation();
    const updatedHistory = history.filter(item => item.id !== id);
    saveHistory(updatedHistory);
    showToast('Removed history item.');
  };

  // Clear all history
  const clearAllHistory = () => {
    if (window.confirm('Clear all translation history?')) {
      saveHistory([]);
      showToast('Cleared all history.');
    }
  };

  // Copy code to clipboard
  const handleCopyCode = (text, isSource) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (isSource) {
      setCopiedSource(true);
      setTimeout(() => setCopiedSource(false), 2000);
    } else {
      setCopiedTarget(true);
      setTimeout(() => setCopiedTarget(false), 2000);
    }
    showToast('Copied code to clipboard.');
  };

  // Download translated code
  const handleDownloadCode = () => {
    if (!translatedCode) return;
    const extensionMap = {
      'Java': 'java',
      'Python': 'py',
      'JavaScript': 'js',
      'TypeScript': 'ts',
      'C++': 'cpp',
      'C#': 'cs',
      'Go': 'go',
      'Rust': 'rs',
      'Ruby': 'rb',
      'PHP': 'php',
      'Swift': 'swift',
      'SQL': 'sql'
    };
    const extension = extensionMap[targetLanguage] || 'txt';
    const blob = new Blob([translatedCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codemorph_${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded code file.');
  };

  // Basic Helper to render formatted explanation strings (converting basic markdown syntax)
  const renderFormattedExplanation = (text) => {
    if (!text) return null;
    
    // Split lines
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let trimmed = line.trim();
      
      // Handle Headers
      if (trimmed.startsWith('###')) {
        return <h4 key={idx} style={{ color: 'var(--text-primary)', marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '1rem', fontWeight: '700' }}>{trimmed.replace('###', '').trim()}</h4>;
      }
      if (trimmed.startsWith('##')) {
        return <h3 key={idx} style={{ color: 'var(--text-primary)', marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '1.15rem', fontWeight: '700' }}>{trimmed.replace('##', '').trim()}</h3>;
      }
      if (trimmed.startsWith('#')) {
        return <h2 key={idx} style={{ color: 'var(--text-primary)', marginTop: '1.75rem', marginBottom: '1rem', fontSize: '1.3rem', fontWeight: '700' }}>{trimmed.replace('#', '').trim()}</h2>;
      }
      
      // Handle Bullet Points
      if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
        const bulletText = trimmed.substring(1).trim();
        return (
          <div key={idx} style={{ display: 'flex', gap: '0.5rem', paddingLeft: '0.75rem', marginBottom: '0.4rem', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--secondary)' }}>•</span>
            <span>{parseInlineCode(bulletText)}</span>
          </div>
        );
      }

      // Handle empty lines
      if (!trimmed) {
        return <div key={idx} style={{ height: '0.75rem' }} />;
      }

      // Default paragraph
      return <p key={idx} style={{ margin: '0 0 0.75rem 0', fontSize: '0.92rem', lineHeight: '1.6' }}>{parseInlineCode(line)}</p>;
    });
  };

  // Convert inline backticks to code styles
  const parseInlineCode = (text) => {
    const parts = text.split(/(`[^`]+`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} style={{
            fontFamily: 'var(--font-code)',
            fontSize: '0.8rem',
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '0.15rem 0.35rem',
            borderRadius: '4px',
            color: 'var(--secondary)',
            fontWeight: '500'
          }}>
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  // Auto calculate line counts for editors
  const getLineNumbers = (code) => {
    const lines = code.split('\n').length;
    return Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <Languages size={28} />
          </div>
          <div>
            <h1 className="logo-text">CodeMorph AI</h1>
            <div className="logo-tagline">Intelligent Multi-Language Code Translator</div>
          </div>
        </div>
        <div className="header-actions">
          <div className="badge-render">
            <div className="badge-dot" />
            <span>Render Deploy Ready</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="workspace-layout">
        {/* Left Sidebar (History Panel) */}
        <aside className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 className="sidebar-title">
              <History size={18} style={{ color: 'var(--primary)' }} />
              <span>Recent Activity</span>
            </h3>
            {history.length > 0 && (
              <button onClick={clearAllHistory} className="btn-icon-sm" title="Clear All History">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div className="history-list">
            {history.length === 0 ? (
              <div className="history-empty">
                No past activity. Translate some code to see history here!
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="history-item" onClick={() => loadHistoryItem(item)}>
                  <div className="history-item-details">
                    <span className="history-item-lang">
                      {item.sourceLanguage} ➔ {item.targetLanguage}
                    </span>
                    <span className="history-item-snippet">{item.sourceCode}</span>
                  </div>
                  <div className="history-item-actions">
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.5rem', alignSelf: 'center' }}>
                      {item.timestamp}
                    </span>
                    <button onClick={(e) => deleteHistoryItem(e, item.id)} className="btn-icon-sm" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-glass)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <Clock size={14} />
              <span>Saves up to 20 local translations</span>
            </div>
          </div>
        </aside>

        {/* Right Section (Translator Workspace) */}
        <main className="translator-panel">
          {/* Editors Side by Side */}
          <div className="editor-grid">
            {/* Input Editor */}
            <div className="editor-container">
              <div className="editor-header">
                <div className="editor-title">
                  <Code size={16} style={{ color: 'var(--primary)' }} />
                  <span>Source Code</span>
                </div>
                <div className="select-wrapper">
                  <select 
                    value={sourceLanguage} 
                    onChange={(e) => setSourceLanguage(e.target.value)} 
                    className="select-lang"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="editor-textarea-wrapper">
                <div className="line-numbers">
                  {getLineNumbers(sourceCode).map((n) => (
                    <div key={n}>{n}</div>
                  ))}
                </div>
                <textarea
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                  placeholder="Paste your source code here..."
                  className="editor-textarea"
                  spellCheck="false"
                />
              </div>
              <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button 
                  onClick={() => handleCopyCode(sourceCode, true)} 
                  className="btn-header-action" 
                  title="Copy Code"
                >
                  {copiedSource ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Output Editor */}
            <div className="editor-container">
              <div className="editor-header">
                <div className="editor-title">
                  <Sparkles size={16} style={{ color: 'var(--secondary)' }} />
                  <span>Translated Output</span>
                </div>
                <div className="select-wrapper">
                  <select 
                    value={targetLanguage} 
                    onChange={(e) => setTargetLanguage(e.target.value)} 
                    className="select-lang"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang.value} value={lang.value}>{lang.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {loading ? (
                <div className="loading-wrapper">
                  <div className="spinner-glow">
                    <div className="spinner-circle" />
                    <div className="spinner-circle" />
                    <div className="spinner-circle" />
                  </div>
                  <div className="loading-text">{LOADING_STEPS[loadingStepIndex]}</div>
                  <div className="loading-sub">Integrating code elements...</div>
                </div>
              ) : translatedCode ? (
                <div className="editor-textarea-wrapper">
                  <div className="line-numbers">
                    {getLineNumbers(translatedCode).map((n) => (
                      <div key={n}>{n}</div>
                    ))}
                  </div>
                  <textarea
                    value={translatedCode}
                    readOnly
                    className="editor-textarea"
                    style={{ color: '#818cf8' }} // Distinct light indigo tint for output code
                  />
                  <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => handleCopyCode(translatedCode, false)} 
                      className="btn-header-action" 
                      title="Copy Code"
                    >
                      {copiedTarget ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                    </button>
                    <button 
                      onClick={handleDownloadCode} 
                      className="btn-header-action" 
                      title="Download File"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="editor-placeholder">
                  <Languages size={48} style={{ opacity: 0.15 }} />
                  <p>Click "Translate & Refactor" to view output</p>
                </div>
              )}
            </div>
          </div>

          {/* Options & Action toolbar */}
          <div className="glass-panel toolbar-section">
            <div className="options-group">
              <label className="option-checkbox">
                <input 
                  type="checkbox" 
                  checked={optimize} 
                  onChange={(e) => setOptimize(e.target.checked)} 
                  className="checkbox-native"
                />
                <div className="checkbox-custom" />
                <span className="option-label">Optimize Performance</span>
              </label>

              <label className="option-checkbox">
                <input 
                  type="checkbox" 
                  checked={explain} 
                  onChange={(e) => setExplain(e.target.checked)} 
                  className="checkbox-native"
                />
                <div className="checkbox-custom" />
                <span className="option-label">Detailed Explanations</span>
              </label>

              <label className="option-checkbox">
                <input 
                  type="checkbox" 
                  checked={cleanCode} 
                  onChange={(e) => setCleanCode(e.target.checked)} 
                  className="checkbox-native"
                />
                <div className="checkbox-custom" />
                <span className="option-label">Clean Code Standards</span>
              </label>
            </div>

            <button 
              onClick={handleTranslate} 
              disabled={loading} 
              className="btn-primary"
            >
              <Play size={16} fill="white" />
              <span>Translate & Refactor</span>
            </button>
          </div>

          {/* Analysis & Explanations Panel (Only shown if results exist) */}
          {(translatedCode && !loading) && (
            <div className="glass-panel result-panel">
              <div className="result-tabs">
                <button 
                  onClick={() => setActiveTab('explanation')} 
                  className={`tab-btn ${activeTab === 'explanation' ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <BookOpen size={16} />
                    <span>Explanation</span>
                  </div>
                </button>
                <button 
                  onClick={() => setActiveTab('complexity')} 
                  className={`tab-btn ${activeTab === 'complexity' ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Cpu size={16} />
                    <span>Complexity</span>
                  </div>
                </button>
                <button 
                  onClick={() => setActiveTab('changes')} 
                  className={`tab-btn ${activeTab === 'changes' ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Zap size={16} />
                    <span>Key Changes ({keyChanges.length})</span>
                  </div>
                </button>
              </div>

              <div className="tab-content">
                {/* Explanation Tab */}
                {activeTab === 'explanation' && (
                  <div className="explanation-block">
                    {explanation ? renderFormattedExplanation(explanation) : (
                      <p style={{ color: 'var(--text-muted)' }}>No explanation was requested or provided.</p>
                    )}
                  </div>
                )}

                {/* Complexity Tab */}
                {activeTab === 'complexity' && (
                  <div className="complexity-grid">
                    <div className="complexity-card">
                      <div className="complexity-icon">
                        <Clock size={24} />
                      </div>
                      <div className="complexity-info">
                        <span className="complexity-label">Time Complexity</span>
                        <span className="complexity-value">{timeComplexity || 'N/A'}</span>
                      </div>
                    </div>
                    
                    <div className="complexity-card">
                      <div className="complexity-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: 'var(--secondary)' }}>
                        <Cpu size={24} />
                      </div>
                      <div className="complexity-info">
                        <span className="complexity-label">Space Complexity</span>
                        <span className="complexity-value">{spaceComplexity || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Key Changes Tab */}
                {activeTab === 'changes' && (
                  <ul className="changes-list">
                    {keyChanges && keyChanges.length > 0 ? (
                      keyChanges.map((change, idx) => (
                        <li key={idx} className="change-item">
                          <span className="change-bullet">⚡</span>
                          <span className="change-text">{change}</span>
                        </li>
                      ))
                    ) : (
                      <div className="history-empty" style={{ width: '100%' }}>
                        No notable structural changes were highlighted for this translation.
                      </div>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Global Toast Alert */}
      {toastMessage && (
        <div className={`toast-alert ${toastType === 'error' ? 'error-toast' : ''}`}>
          {toastType === 'error' ? <AlertCircle size={18} className="toast-icon" /> : <Check size={18} className="toast-icon" />}
          <span className="toast-message">{toastMessage}</span>
        </div>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>© 2026 CodeMorph AI. Engineered using Spring Boot, React, and Gemini 2.5 Flash.</p>
        <div className="footer-links">
          <a href="#" className="footer-link">Documentation</a>
          <a href="#" className="footer-link">Privacy Policy</a>
          <a href="#" className="footer-link">Support</a>
        </div>
      </footer>
    </div>
  );
}
