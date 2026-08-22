import { useState } from 'react';
import GeneratePanel from './components/GeneratePanel';
import TextureGallery from './components/TextureGallery';
import './App.css';

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="app-layout">
      <GeneratePanel onGenerated={() => setRefreshKey(k => k + 1)} />
      <TextureGallery refreshKey={refreshKey} />
    </div>
  );
}
