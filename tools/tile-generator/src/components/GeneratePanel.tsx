import { useState, useEffect, useRef } from 'react';
import * as api from '../api';
import { TERRAIN_PRESETS, FEATURE_PRESETS } from '../presets';
import type { FalModel } from '../types';
import './GeneratePanel.css';

const DEFAULT_MODEL = 'fal-ai/flux-2/turbo';
const BG_MODELS = [
  { id: 'fal-ai/imageutils/rembg', label: 'rembg — Fast & Cheap ⚡' },
  { id: 'fal-ai/bria/background/remove', label: 'BRIA — Higher Quality' },
];

interface Props {
  onGenerated: () => void;
}

export default function GeneratePanel({ onGenerated }: Props) {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState<FalModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tileName, setTileName] = useState('');
  const [width, setWidth] = useState(256);
  const [height, setHeight] = useState(256);
  const [autoRemoveBg, setAutoRemoveBg] = useState(false);
  const [bgModel, setBgModel] = useState(BG_MODELS[0].id);
  const [variationCount, setVariationCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'idle' | 'ok' | 'error' }>({ text: '', type: 'idle' });
  const [estimate, setEstimate] = useState<string>('—');
  const [activeTerrainPreset, setActiveTerrainPreset] = useState<string | null>(null);
  const [activeFeaturePreset, setActiveFeaturePreset] = useState<string | null>(null);
  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch models when picker opens
  useEffect(() => {
    if (!showModelPicker || models.length > 0) return;
    setLoadingModels(true);
    api.fetchModels().then(m => { setModels(m); setLoadingModels(false); }).catch(() => setLoadingModels(false));
  }, [showModelPicker, models.length]);

  // Debounced cost estimate
  useEffect(() => {
    if (estimateTimer.current) clearTimeout(estimateTimer.current);
    estimateTimer.current = setTimeout(async () => {
      try {
        const r = await api.estimateCost(model, width, height);
        if (r.estimatedCost != null) {
          setEstimate(`$${r.estimatedCost.toFixed(4)} ${r.currency ?? 'USD'}`);
        } else {
          setEstimate('—');
        }
      } catch {
        setEstimate('—');
      }
    }, 600);
    return () => { if (estimateTimer.current) clearTimeout(estimateTimer.current); };
  }, [model, width, height]);

  function applyTerrainPreset(key: string) {
    const p = TERRAIN_PRESETS[key];
    setPrompt(p.prompt);
    setTileName(p.file);
    setWidth(p.w);
    setHeight(p.h);
    setActiveTerrainPreset(key);
    setActiveFeaturePreset(null);
  }

  function applyFeaturePreset(key: string) {
    const p = FEATURE_PRESETS[key];
    setPrompt(p.prompt);
    setTileName(p.file);
    setWidth(p.w);
    setHeight(p.h);
    setActiveFeaturePreset(key);
    setActiveTerrainPreset(null);
  }

  async function handleGenerate() {
    if (!prompt.trim() || !tileName.trim()) {
      setStatus({ text: 'Enter a prompt and tile name.', type: 'error' });
      return;
    }
    setGenerating(true);
    const count = Math.max(1, Math.min(10, variationCount));
    setStatus({ text: `Generating ${count} variation${count > 1 ? 's' : ''}…`, type: 'idle' });
    try {
      const results = [];
      for (let i = 0; i < count; i++) {
        if (count > 1) {
          setStatus({ text: `Generating variation ${i + 1}/${count}…`, type: 'idle' });
        }
        const result = await api.generate({ model, prompt, tileName: tileName.trim(), width, height });
        if (!result.ok) {
          setStatus({ text: result.error ?? 'Generation failed', type: 'error' });
          return;
        }
        if (autoRemoveBg && result.filename) {
          setStatus({ text: `Removing background for variation ${i + 1}…`, type: 'idle' });
          const bgResult = await api.removeBg(result.filename, bgModel);
          if (!bgResult.ok) {
            setStatus({ text: `Generated but bg-remove failed: ${bgResult.error}`, type: 'error' });
            onGenerated();
            return;
          }
        }
        results.push(result.filename);
      }
      setStatus({ text: `Saved ${results.length} variation${results.length > 1 ? 's' : ''}`, type: 'ok' });
      onGenerated();
    } catch (e: unknown) {
      setStatus({ text: String(e), type: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <aside className="gen-panel">
      <div className="gen-header">
        <h1>🗺️ Tile Generator</h1>
        <p className="gen-subtitle">AI terrain tiles for Civ</p>
      </div>

      {/* Model */}
      <section className="gen-section">
        <h3>Model</h3>
        <div className="model-row">
          <select
            className="field-input"
            value={model}
            onChange={e => setModel(e.target.value)}
          >
            <option value="fal-ai/flux-2/turbo">Flux 2 Turbo ⚡</option>
            <option value="fal-ai/flux/schnell">Flux Schnell</option>
            <option value="fal-ai/flux/dev">Flux Dev</option>
            <option value="fal-ai/fast-sdxl">Fast SDXL</option>
            {!['fal-ai/flux-2/turbo','fal-ai/flux/schnell','fal-ai/flux/dev','fal-ai/fast-sdxl'].includes(model) && (
              <option value={model}>{model}</option>
            )}
          </select>
          <button className="btn-secondary" onClick={() => setShowModelPicker(true)}>Browse</button>
        </div>
        <div className="model-meta">
          Est. cost: <span className="cost">{estimate}</span>
        </div>
      </section>

      {/* Terrain presets */}
      <section className="gen-section">
        <h3>Terrain Tiles</h3>
        <div className="preset-grid">
          {Object.entries(TERRAIN_PRESETS).map(([key, p]) => (
            <button
              key={key}
              className={`preset-btn${activeTerrainPreset === key ? ' active' : ''}`}
              onClick={() => applyTerrainPreset(key)}
            >
              <span className="preset-dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* Feature presets */}
      <section className="gen-section">
        <h3>Feature Sprites</h3>
        <div className="preset-grid">
          {Object.entries(FEATURE_PRESETS).map(([key, p]) => (
            <button
              key={key}
              className={`preset-btn${activeFeaturePreset === key ? ' active' : ''}`}
              onClick={() => applyFeaturePreset(key)}
            >
              <span className="preset-dot" style={{ background: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* Prompt */}
      <section className="gen-section">
        <h3>Prompt</h3>
        <textarea
          className="field-input prompt-area"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the tile…"
          rows={4}
        />
      </section>

      {/* Size */}
      <section className="gen-section">
        <h3>Size</h3>
        <div className="size-row">
          <label className="size-field">
            <span>W</span>
            <input className="field-input" type="number" value={width} min={64} max={2048} step={64}
              onChange={e => setWidth(Number(e.target.value))} />
          </label>
          <span className="size-sep">×</span>
          <label className="size-field">
            <span>H</span>
            <input className="field-input" type="number" value={height} min={64} max={2048} step={64}
              onChange={e => setHeight(Number(e.target.value))} />
          </label>
        </div>
      </section>

      {/* Tile name */}
      <section className="gen-section">
        <h3>Tile Name</h3>
        <input
          className="field-input"
          type="text"
          value={tileName}
          onChange={e => setTileName(e.target.value)}
          placeholder="e.g. terrain_grassland"
        />
        <p className="field-hint">Variants are stored as <code>{tileName || 'name'}_1.png</code>, <code>_2.png</code>, …</p>
      </section>

      {/* Variation count */}
      <section className="gen-section">
        <h3>Variations</h3>
        <div className="variation-row">
          <input
            className="field-input"
            type="number"
            value={variationCount}
            min={1}
            max={10}
            onChange={e => setVariationCount(Number(e.target.value))}
          />
          <span className="variation-hint">Generate multiple variations at once (1-10)</span>
        </div>
      </section>

      {/* Remove BG */}
      <section className="gen-section">
        <label className="checkbox-row">
          <input type="checkbox" checked={autoRemoveBg} onChange={e => setAutoRemoveBg(e.target.checked)} />
          Remove background after generation
        </label>
        {autoRemoveBg && (
          <select className="field-input" style={{ marginTop: 6 }} value={bgModel} onChange={e => setBgModel(e.target.value)}>
            {BG_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        )}
      </section>

      {/* Generate */}
      <section className="gen-section">
        <button
          className="btn-generate"
          onClick={handleGenerate}
          disabled={generating || !prompt.trim() || !tileName.trim()}
        >
          {generating ? '⏳ Generating…' : '✨ Generate'}
        </button>
        {status.text && (
          <p className={`gen-status ${status.type}`}>{status.text}</p>
        )}
      </section>

      {/* Model picker dialog */}
      {showModelPicker && (
        <div className="modal-overlay" onClick={() => setShowModelPicker(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Choose Model</span>
              <button className="modal-close" onClick={() => setShowModelPicker(false)}>✕</button>
            </div>
            <div className="modal-search">
              <input
                className="field-input"
                autoFocus
                placeholder="Search models…"
                value={modelSearch}
                onChange={e => setModelSearch(e.target.value)}
              />
            </div>
            <div className="modal-list">
              {loadingModels && <p className="modal-loading">Loading models…</p>}
              {filteredModels.map(m => (
                <button
                  key={m.id}
                  className={`model-item${model === m.id ? ' active' : ''}`}
                  onClick={() => { setModel(m.id); setShowModelPicker(false); }}
                >
                  <span className="model-item-name">{m.name}</span>
                  <span className="model-item-id">{m.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
