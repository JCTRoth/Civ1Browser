import React, { useState, useEffect } from 'react';
import { ProgressBar } from 'react-bootstrap';

const LoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing...');

  const loadingSteps = [
    { progress: 10, status: 'Loading game constants...' },
    { progress: 25, status: 'Initializing hex grid system...' },
    { progress: 40, status: 'Generating world map...' },
    { progress: 55, status: 'Placing civilizations...' },
    { progress: 70, status: 'Creating starting units...' },
    { progress: 85, status: 'Setting up AI systems...' },
    { progress: 100, status: 'Ready to play!' }
  ];

  useEffect(() => {
    let stepIndex = 0;
    
    const progressInterval = setInterval(() => {
      if (stepIndex < loadingSteps.length) {
        const step = loadingSteps[stepIndex];
        setProgress(step.progress);
        setStatus(step.status);
        stepIndex++;
      } else {
        clearInterval(progressInterval);
      }
    }, 500);

    return () => clearInterval(progressInterval);
  }, []);

  return (
    <div className="loading-screen">
      <div className="text-center">
        <h1 className="loading-title">
          <i className="bi bi-globe2"></i>
          <br />
          Civilization Browser
        </h1>
        
        <div className="loading-progress mb-3">
          <ProgressBar 
            now={progress} 
            variant="warning"
            animated
            className="loading-progress-bar"
          />
        </div>
        
        <p className="loading-status">{status}</p>
        
        <div className="mt-4 text-light">
          <small>
            <i className="bi bi-info-circle"></i>
            {' '}A browser-based Civilization clone built with React
          </small>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;