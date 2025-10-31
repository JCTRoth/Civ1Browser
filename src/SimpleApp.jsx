import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import App from './App.jsx';

const SimpleApp = () => {
  console.log('SimpleApp rendering...');
  
  return (
    <div className="container-fluid p-3">
      <div className="row">
        <div className="col-12">
          <h1 className="text-primary">🏛️ Civilization Browser - Debug</h1>
          <p className="text-success">✓ React is working</p>
          <p className="text-info">✓ Bootstrap CSS is loaded</p>
          <button className="btn btn-primary me-2">Test Bootstrap Button</button>
          <button className="btn btn-secondary">Another Button</button>
          
          <hr />
          <h2 className="text-warning">Testing Main App Component:</h2>
          <ErrorBoundary>
            <div className="border p-3 bg-light">
              <App />
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};

export default SimpleApp;