import React from 'react';

const VerySimple = () => {
  console.log('VerySimple component rendering...');
  
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#e74c3c',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '2rem',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>🎮 React is Working!</h1>
        <p>If you see this red page, React is rendering correctly.</p>
        <div style={{ marginTop: '20px', fontSize: '1rem' }}>
          <p>✅ React rendering</p>
          <p>✅ Components loading</p>
          <p>✅ Styles applying</p>
        </div>
      </div>
    </div>
  );
};

export default VerySimple;