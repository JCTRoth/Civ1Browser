import { useState } from 'react';
import GeneratePanel from './components/GeneratePanel';
import TextureGallery from './components/TextureGallery';
import './App.css';

export interface SourceSelection {
  path: string;
  name: string;
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingSource, setPendingSource] = useState<SourceSelection | null>(null);

  return (
    <div className="app-layout">
      <GeneratePanel
        onGenerated={() => setRefreshKey(k => k + 1)}
        pendingSource={pendingSource}
        onPendingSourceConsumed={() => setPendingSource(null)}
      />
      <TextureGallery
        refreshKey={refreshKey}
        onUseAsSource={(s: SourceSelection) => setPendingSource(s)}
      />
    </div>
  );
}
