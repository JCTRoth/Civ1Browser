# Civilization 1 Browser - React Edition

A modern browser-based recreation of the classic Civilization game, built with React.js, Vite, Jotai, and Bootstrap.

## 🎮 Features

- **Turn-based Strategy Gameplay**: Classic Civilization mechanics with modern React architecture
- **Hexagonal Grid System**: Accurate hex-based world map with smooth navigation
- **AI Civilizations**: Compete against computer opponents with distinct personalities
- **City Management**: Build cities, manage population, construct buildings
- **Unit System**: Move armies, explore the world, engage in tactical combat
- **Technology Research**: Progress through technological advances
- **Resource Management**: Balance food, production, trade, science, and gold
- **Responsive UI**: Bootstrap-powered interface that works on desktop and mobile

## 🛠️ Tech Stack

- **React 18**: Modern React with hooks and functional components
- **Vite**: Lightning-fast development and building
- **Jotai**: Atomic state management for scalable React apps
- **Bootstrap 5**: Professional UI components and responsive design
- **HTML5 Canvas**: Hardware-accelerated game rendering
- **ES6 Modules**: Clean, modern JavaScript architecture

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn package manager

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd Civ1Browser
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## 🎯 How to Play

### Getting Started
1. Click "New Game" to generate a random world
2. Use your **Settler** to found your first city near water and resources
3. Explore with your **Warrior** to discover the world and other civilizations
4. Build more units and expand your civilization

### Controls

**Mouse:**
- **Left Click**: Select units, cities, or tiles
- **Drag**: Pan the camera around the map  
- **Scroll Wheel**: Zoom in and out
- **Right Click**: Context menu (coming soon)

**Keyboard:**
- **Space/Enter**: End turn
- **H**: Help dialog
- **T**: Technology tree
- **D**: Diplomacy
- **M**: Toggle minimap
- **Escape**: Close dialogs

### Game Concepts

**Resources:**
- 🍎 **Food**: Grows city population
- ⚙️ **Production**: Builds units and structures  
- ↔️ **Trade**: Generates gold and science
- 🎓 **Science**: Researches technologies
- 💰 **Gold**: Maintains units and buildings

**Victory Conditions:**
- Conquest: Eliminate all other civilizations
- Technology: Be the first to discover advanced technologies
- Score: Have the highest civilization score

## 📁 Project Structure

```
src/
├── components/          # React components
│   ├── game/           # Game-specific components
│   │   └── GameCanvas.jsx
│   └── ui/             # UI components
│       ├── TopBar.jsx
│       ├── SidePanel.jsx
│       ├── BottomPanel.jsx
│       └── GameModals.jsx
├── stores/             # Jotai state atoms
│   └── gameStore.js
├── game/               # Core game logic
│   ├── GameEngine.js
│   └── hexGrid.js
├── hooks/              # Custom React hooks
│   └── useGameEngine.js
├── utils/              # Utilities and constants
│   └── constants.js
└── styles/             # CSS styles
    └── index.css
```

## 🎨 Architecture

### State Management (Jotai)
The game uses Jotai for atomic state management:

- **Game State**: Current turn, active player, selections
- **Map State**: World tiles, terrain, improvements
- **Units/Cities**: Entity collections with real-time updates
- **UI State**: Panel visibility, dialogs, notifications
- **Derived State**: Computed values like current player resources

### Game Engine
The `GameEngine` class manages core game logic:

- **World Generation**: Procedural terrain and resource placement
- **Turn Processing**: AI decisions, resource calculations, unit movement
- **Combat System**: Tactical battle resolution
- **City Management**: Population growth, production queues
- **Technology Tree**: Research progression and prerequisites

### Rendering System
HTML5 Canvas provides smooth, scalable graphics:

- **Hexagonal Grid**: Mathematically accurate hex coordinate system
- **Camera System**: Smooth panning and zooming with viewport culling
- **Entity Rendering**: Efficient drawing of tiles, units, and cities
- **Minimap**: Real-time overview with click-to-navigate

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Debug Features

Open browser console for debug commands:

```javascript
// Show game state
window.gameEngine.getAllUnits()
window.gameEngine.getAllCities()

// Direct unit manipulation (dev only)
window.gameEngine.moveUnit('unit_0_0', 10, 10)
```

### Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is for educational purposes. Original Civilization © MicroProse/Firaxis Games.

## 🙏 Acknowledgments

- Sid Meier for creating the original Civilization
- The React.js team for the excellent framework
- Bootstrap team for the UI components
- Jotai team for the state management solution

---

**Enjoy building your civilization! 🏛️**