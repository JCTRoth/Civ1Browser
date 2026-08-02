import { Modal } from 'react-bootstrap';
import { TERRAIN_TYPES } from '@/data/TerrainData';
import { IMPROVEMENT_TYPES } from '@/data/TileImprovementConstants';
import '../../styles/hexDetailModal.css';

const HexDetailModal = ({ show, onHide, hex, terrain}) => {
  if (!hex || !terrain) return null;

  const centerTile = terrain[hex.row]?.[hex.col];
  if (!centerTile) return null;

  const terrainInfo = TERRAIN_TYPES[centerTile.type];

  // Get adjacent hexes (6 neighbors in hexagonal grid)
  const getAdjacentHexes = () => {
    const isOddRow = hex.row % 2 === 1;
    const offsets = isOddRow ? [
      { col: 0, row: -1, label: 'Ocean' },     // Top
      { col: 1, row: -1, label: 'Plains' },    // Top-right
      { col: 1, row: 0, label: 'Desert' },     // Right
      { col: 1, row: 1, label: 'Ocean' },      // Bottom-right
      { col: 0, row: 1, label: 'Ocean' },      // Bottom
      { col: -1, row: 0, label: 'Plains' },    // Left
    ] : [
      { col: 0, row: -1, label: 'Ocean' },     // Top
      { col: 1, row: 0, label: 'Plains' },     // Top-right
      { col: 1, row: 1, label: 'Desert' },     // Right
      { col: 0, row: 1, label: 'Ocean' },      // Bottom-right
      { col: -1, row: 1, label: 'Ocean' },     // Bottom
      { col: -1, row: 0, label: 'Plains' },    // Left
    ];

    return offsets.map(offset => {
      const adjRow = hex.row + offset.row;
      const adjCol = hex.col + offset.col;
      const tile = terrain[adjRow]?.[adjCol];
      return {
        ...offset,
        tile: tile,
        terrainType: tile ? TERRAIN_TYPES[tile.type] : null
      };
    });
  };

  const adjacentHexes = getAdjacentHexes();

  // Hex positions for visual layout
  const hexPositions = [
    { top: '20%', left: '50%', index: 0 },   // Top
    { top: '35%', left: '70%', index: 1 },   // Top-right
    { top: '65%', left: '70%', index: 2 },   // Bottom-right
    { top: '80%', left: '50%', index: 3 },   // Bottom
    { top: '65%', left: '30%', index: 4 },   // Bottom-left
    { top: '35%', left: '30%', index: 5 },   // Top-left
  ];

  const hasRoad = centerTile.hasRoad || [IMPROVEMENT_TYPES.ROAD, IMPROVEMENT_TYPES.RAILROAD].includes(centerTile.improvement);

  return (
    <Modal 
      show={show} 
      onHide={onHide} 
      centered
      size="lg"
      fullscreen="lg-down"
      className="hex-detail-modal"
    >
      <Modal.Header closeButton className="hex-detail-modal__header">
        <Modal.Title className="hex-detail-modal__title">
          <span className="hex-detail-modal__title-text">TERRAIN VIEW</span>
          <div className="hex-detail-modal__badges">
            <span className="hex-detail-modal__badge">Hex: {hex.col}, {hex.row}</span>
            <span className="hex-detail-modal__badge hex-detail-modal__badge--info">{terrainInfo.name}</span>
          </div>
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="hex-detail-modal__body">
        <div className="hex-detail-layout">
          {/* Left Info Panel */}
          <div className="hex-detail-sidebar">
            <div className="hex-detail-sidebar__hero">
              <strong>4000 BC ?</strong><br />
              <strong>540 0.5.5</strong><br />
              <strong>Indian</strong><br />
              <span>Settler: 0</span><br />
              <strong>HOME</strong><br />
              <strong>{terrainInfo.name}</strong>
            </div>

            <div className="hex-detail-sidebar__section">
              {centerTile.unit && (
                <>
                  <div className="mb-2">
                    <strong>Active Unit</strong><br />
                    <span>{centerTile.unit.type}</span><br />
                    <span>Moves: {centerTile.unit.moves}/1</span>
                  </div>
                  <div className="hex-detail-sidebar__divider" />
                </>
              )}
              
              <div className="mt-1">
                <strong>Movement:</strong> 1/3 MP<br />
                <strong>Defense:</strong> +50%<br />
              </div>
            </div>

            <div className="hex-detail-sidebar__section">
              <strong>Resources:</strong><br />
              <span>Food: 2 🌾</span><br />
              <span>Prod: 1 ⚒️</span><br />
              <span>Trade: 1 💰</span>
            </div>

            <div className="hex-detail-sidebar__section">
              <strong>Features:</strong><br />
              {centerTile.hasRiver && <span>• River<br /></span>}
              {hasRoad && <span>• Road<br /></span>}
              {centerTile.improvement && <span>• {centerTile.improvement}<br /></span>}
              {!centerTile.hasRiver && !hasRoad && !centerTile.improvement && <span>• None<br /></span>}
            </div>

            {centerTile.city && (
              <div className="hex-detail-sidebar__section">
                <strong>City:</strong><br />
                <span>{centerTile.city.name}</span><br />
                <span>Size: {centerTile.city.population || 1}</span>
              </div>
            )}
          </div>

          {/* Center Hex Display */}
          <div className="hex-detail-map">
            {/* Title Bar */}
            <div className="hex-detail-map__titlebar">
              <span>☰ Menu Bar</span>
              <span>🗺️ Map Window</span>
            </div>

            {/* Hex Grid Visual */}
            <div className="hex-detail-map__grid">
              {/* Center hex */}
              <div className="hex-detail-map__center">
                <div
                  className="hex-detail-map__hex hex-detail-map__hex--center"
                  style={{
                    backgroundColor: terrainInfo.color,
                    borderColor: '#FFF'
                  }}
                >
                  {terrainInfo.char}
                </div>
                {centerTile.unit && (
                  <div className="hex-detail-map__unit-label">
                    Active Unit
                  </div>
                )}
              </div>

              {/* Adjacent hexes */}
              {hexPositions.map((pos, idx) => {
                const adjHex = adjacentHexes[pos.index];
                if (!adjHex || !adjHex.terrainType) return null;

                return (
                  <div
                    key={idx}
                    className="hex-detail-map__adjacent"
                    style={{
                      top: pos.top,
                      left: pos.left,
                    }}
                  >
                    <div
                      className="hex-detail-map__hex"
                      style={{
                        backgroundColor: adjHex.terrainType.color,
                        borderColor: '#888',
                        opacity: 0.9
                      }}
                    >
                      {adjHex.terrainType.char}
                    </div>
                    <div className="hex-detail-map__adjacent-label">
                      {adjHex.terrainType.name}
                    </div>
                  </div>
                );
              })}

              {/* Connection lines */}
              <svg 
                className="hex-detail-map__lines"
                aria-hidden="true"
              >
                {hexPositions.map((pos, idx) => (
                  <line
                    key={idx}
                    x1="50%"
                    y1="50%"
                    x2={pos.left}
                    y2={pos.top}
                    stroke="#555"
                    strokeWidth="1"
                    strokeDasharray="5,5"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
      </Modal.Body>
      
      <Modal.Footer className="hex-detail-modal__footer">
        <button className="touch-btn touch-btn--ghost" onClick={onHide}>
          Close
        </button>
        <button className="touch-btn touch-btn--primary" onClick={() => console.log('[CLICK] HexDetailModal center view button (not implemented)')}>
          Center View
        </button>
        <button className="touch-btn touch-btn--primary" onClick={() => console.log('[CLICK] HexDetailModal move unit here button (not implemented)')}>
          Move Unit Here
        </button>
      </Modal.Footer>
    </Modal>
  );
};

export default HexDetailModal;
