import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type { GameTile, TextureGroup, TextureVariant } from '../types';
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  // Split into terrain and feature groups
  const terrainGroups = filtered.filter(g => !g.name.endsWith('_feature'));
  const featureGroups = filtered.filter(g => g.name.endsWith('_feature'));

  function toggleSelect(filename: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <main className="gallery">
      <div className="gallery-header">
        <h2>Generated Textures</h2>
        <span className="gallery-count">
          {groups.length} group{groups.length !== 1 ? 's' : ''} ·{' '}
          {groups.reduce((n, g) => n + g.variants.length, 0)} variants
          {selected.size > 0 && ` · ${selected.size} selected`}
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

        {terrainGroups.length > 0 && (
          <>
            <h3 className="gallery-section-title">🏔️ Terrain Tiles</h3>
            {terrainGroups.map(group => (
              <GroupRow
                key={group.name}
                group={group}
                onRefresh={doRefresh}
                onPreview={setPreview}
                selected={selected}
                onToggleSelect={toggleSelect}
                onClearSelection={clearSelection}
              />
            ))}
          </>
        )}

        {featureGroups.length > 0 && (
          <>
            <h3 className="gallery-section-title">🌿 Feature Sprites</h3>
            {featureGroups.map(group => (
              <GroupRow
                key={group.name}
                group={group}
                onRefresh={doRefresh}
                onPreview={setPreview}
                selected={selected}
                onToggleSelect={toggleSelect}
                onClearSelection={clearSelection}
              />
            ))}
          </>
        )}
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
  selected,
  onToggleSelect,
  onClearSelection,
}: {
  group: TextureGroup;
  onRefresh: () => void;
  onPreview: (state: PreviewState) => void;
  selected: Set<string>;
  onToggleSelect: (filename: string) => void;
  onClearSelection: () => void;
}) {
  const groupSelected = group.variants.filter(v => selected.has(v.filename));
  const hasSelection = groupSelected.length > 0;
  const [removingAll, setRemovingAll] = useState(false);

  async function handleUseSelected() {
    if (groupSelected.length === 0) return;
    // Send all selected filenames
    const filenames = groupSelected.map(v => v.filename);
    try {
      await api.useInGame(filenames);
      onClearSelection();
      onRefresh();
    } catch (e) {
      console.error('Failed to use selected:', e);
    }
  }

  async function handleRemoveAllFromGame() {
    if (group.inGameTiles.length === 0) return;
    if (!window.confirm(`Remove ${group.inGameTiles.length} in-game tile(s) of ${group.name}?`)) return;
    setRemovingAll(true);
    try {
      await api.removeFromGame(group.inGameTiles.map(t => t.filename));
      onRefresh();
    } catch (e) {
      console.error('Failed to remove from game:', e);
    } finally {
      setRemovingAll(false);
    }
  }

  return (
    <div className="group-row">
      <div className="group-header">
        <span className="group-name">{group.name}</span>
        <span className="group-meta">
          {group.variants.length} variant{group.variants.length !== 1 ? 's' : ''}
          {group.inGameTiles.length > 0 && (
            <span className="badge-live">
              {group.inGameTiles.length} IN GAME
            </span>
          )}
          {hasSelection && <span className="badge-selected">{groupSelected.length} selected</span>}
        </span>
        <div className="group-actions">
          {group.inGameTiles.length > 0 && (
            <button
              className="btn-remove-all"
              disabled={removingAll}
              onClick={handleRemoveAllFromGame}
              title="Remove all in-game tiles of this group"
            >
              {removingAll ? '…' : '✕ Remove All from Game'}
            </button>
          )}
          {hasSelection && (
            <button className="btn-use-selected" onClick={handleUseSelected}>
              ▶ Use Selected
            </button>
          )}
        </div>
      </div>
      <div className="variants-strip">
        {/* Current in-game tiles */}
        {group.inGameTiles.map(tile => (
          <InGameCard key={tile.filename} tile={tile} onRefresh={onRefresh} onPreview={onPreview} />
        ))}

        {/* Generated variants */}
        {group.variants.map(v => (
          <VariantCard
            key={v.filename}
            variant={v}
            onRefresh={onRefresh}
            onPreview={onPreview}
            livePath={group.inGame?.path}
            isSelected={selected.has(v.filename)}
            onToggleSelect={() => onToggleSelect(v.filename)}
          />
        ))}
      </div>
    </div>
  );
}

function InGameCard({
  tile,
  onRefresh,
  onPreview,
}: {
  tile: GameTile;
  onRefresh: () => void;
  onPreview: (state: PreviewState) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleRemove() {
    if (!window.confirm(`Remove ${tile.filename} from game?`)) return;
    setBusy(true);
    try {
      await api.removeFromGame(tile.filename);
      onRefresh();
    } catch (e) {
      console.error('Failed to remove from game:', e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`variant-card in-game-card${busy ? ' variant-busy' : ''}`}>
      <div className="card-badge-live">IN GAME</div>
      <div className="card-img-wrap" onClick={() => onPreview({ variant: tile.path })}>
        {busy && <div className="card-spinner">⏳</div>}
        <img src={tile.path} alt={tile.filename} loading="lazy" />
      </div>
      <div className="card-footer">
        <span className="card-label">{tile.filename}</span>
        <span className="card-size">{formatSize(tile.size)}</span>
      </div>
      <div className="card-actions">
        <button
          className="btn-remove-game"
          disabled={busy}
          onClick={handleRemove}
          title="Remove from game assets"
        >
          {busy ? '…' : '✕ Remove from Game'}
        </button>
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  onRefresh,
  onPreview,
  livePath,
  isSelected,
  onToggleSelect,
}: {
  variant: TextureVariant;
  onRefresh: () => void;
  onPreview: (state: PreviewState) => void;
  livePath?: string;
  isSelected: boolean;
  onToggleSelect: () => void;
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
    <div className={`variant-card${isBusy ? ' variant-busy' : ''}${isSelected ? ' variant-selected' : ''}`}>
      <div className="card-select" onClick={onToggleSelect}>
        <input type="checkbox" checked={isSelected} readOnly />
      </div>
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
