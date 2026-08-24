/// <reference types="vite/client" />

// Side-effect CSS imports (e.g. `import './Component.css'`) are ambient in
// Vite apps; declare them so tsc doesn't complain about the missing module.
declare module '*.css';
