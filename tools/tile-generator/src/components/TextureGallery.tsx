import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { TextureGroup, TextureVariant } from '../types';
import './TextureGallery.css';

interface PreviewState {
  variant: string;
  live?: string;
}

interface Props {
  refreshKey: number;
}

export default function TextureGallery({ refreshKey }: Props) {
  const [groups, setGroups] = useState<TextureGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const doRefresh = useCallback(() => setRefresh(r => r + 1), []);

  useEffect(() => {
    setLoading(true);
    api.fetchTextures()
      .then(g => { setGroups(g); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refreshKey, refresh]);

  const filtered = search.trim()
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <main className="gallery">
      <div className="gallery-header">
        <h2>Generated Textures</h2>
        <span className="gallery-count">
          {groups.length} group{groups.length !== 1 ? 's' : ''} ·{' '}
          {groups.reduce((n, g) => n + g.variants.length, 0)} variants
        </span>
        <input
          className="gallery-search"
          placeholder="Filter by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="gallery-body">
        {loading && <p className="gallery-empty">Loading…</p>}

        {!loading && filtered.length === 0 && (
          <div className="gallery-empty">
            <div className="gallery-empty-icon">🎲</div>
            {search ? 'No groups match your filter.' : 'No textures yet. Generate some!'}
          </div>
        )}

        {filtered.map(group => (
          <GroupRow key={group.name} group={group} onRefresh={doRefresh} onPreview={setPreview} />
        ))}
      </div>

      {/* Lightbox */}
      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <div className="lightbox-image-wrap">
              {preview.live && <div className="lightbox-label">Variant</div>}
              <img src={preview.variant} alt="Preview" />
            </div>
            {preview.live && (
              <div className="lightbox-image-wrap">
                <div className="lightbox-label live">Live</div>
                <img src={preview.live} alt="Live version" />
              </div>
            )}
          </div>
          <button className="lightbox-close" onClick={() => setPreview(null)}>✕</button>
        </div>
      )}
    </main>
  );
}

function GroupRow({
  group,
  onRefresh,
  onPreview,
}: {
  group: TextureGroup;
  onRefresh: () => void;
  onPreview: (state: PreviewState) => void;
}) {
  return (
    <div className="group-row">
      <div className="group-header">
        <span className="group-name">{group.name}</span>
        <span className="group-meta">
          {group.variants.length} variant{group.variants.length !== 1 ? 's' : ''}
          {group.inGame && <span className="badge-live">LIVE</span>}
        </span>
      </div>
      <div className="variants-strip">
        {/* Current in-game tile */}
        {group.inGame && (
          <div className="variant-card in-game-card">
            <div className="card-badge-live">IN GAME</div>
            <div className="card-img-wrap" onClick={() => onPreview({ variant: group.inGame!.path })}>
              <img src={group.inGame.path} alt="In game" loading="lazy" />
            </div>
            <div className="card-footer">
              <span className="card-label">{group.inGame.filename}</span>
              <span className="card-size">{formatSize(group.inGame.size)}</span>
            </div>
          </div>
        )}

        {/* Generated variants */}
        {group.variants.map(v => (
          <VariantCard key={v.filename} variant={v} onRefresh={onRefresh} onPreview={onPreview} livePath={group.inGame?.path} />
        ))}
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  onRefresh,
  onPreview,
  livePath,
}: {
  variant: TextureVariant;
  onRefresh: () => void;
  onPreview: (state: PreviewState) => void;
  livePath?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [bgModelOpen, setBgModelOpen] = useState(false);
  const [bgModel, setBgModel] = useState('fal-ai/imageutils/rembg');

  async function handleUseInGame() {
    setBusy('use');
    try {
      await api.useInGame(variant.filename);
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveBg() {
    setBgModelOpen(false);
    setBusy('bg');
    try {
      await api.removeBg(variant.filename, bgModel);
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${variant.filename}?`)) return;
    setBusy('del');
    try {
      await api.deleteTexture(variant.filename);
      onRefresh();
    } finally {
      setBusy(null);
    }
  }

  const isBusy = busy !== null;

  return (
    <div className={`variant-card${isBusy ? ' variant-busy' : ''}`}>
      <div className="card-n">#{variant.n}</div>
      <div className="card-img-wrap" onClick={() => onPreview({ variant: variant.path, live: livePath })}>
        {busy === 'use' && <div className="card-spinner">⏳</div>}
        {busy === 'bg' && <div className="card-spinner">✂️</div>}
        <img src={variant.path} alt={variant.filename} loading="lazy" />
      </div>
      <div className="card-footer">
        <span className="card-size">{formatSize(variant.size)}</span>
      </div>
      <div className="card-actions">
        <button
          className="btn-use-game"
          disabled={isBusy}
          onClick={handleUseInGame}
          title="Copy to game assets"
        >
          {busy === 'use' ? '…' : '▶ Use in Game'}
        </button>
        <div className="card-actions-row2">
          <div className="bg-btn-wrap">
            <button
              className="btn-icon"
              disabled={isBusy}
              onClick={() => setBgModelOpen(o => !o)}
              title="Remove background"
            >
              {busy === 'bg' ? '…' : '⬛ BG'}
            </button>
            {bgModelOpen && (
              <div className="bg-picker">
                <label>
                  <input type="radio" name={`bg-${variant.filename}`} value="fal-ai/imageutils/rembg"
                    checked={bgModel === 'fal-ai/imageutils/rembg'} onChange={() => setBgModel('fal-ai/imageutils/rembg')} />
                  rembg ⚡
                </label>
                <label>
                  <input type="radio" name={`bg-${variant.filename}`} value="fal-ai/bria/background/remove"
                    checked={bgModel === 'fal-ai/bria/background/remove'} onChange={() => setBgModel('fal-ai/bria/background/remove')} />
                  BRIA
                </label>
                <button className="bg-go" onClick={handleRemoveBg}>Go</button>
              </div>
            )}
          </div>
          <button
            className="btn-icon btn-del"
            disabled={isBusy}
            onClick={handleDelete}
            title="Delete"
          >
            {busy === 'del' ? '…' : '🗑'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
