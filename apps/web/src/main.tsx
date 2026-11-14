import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo';
import App from './app/app';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(<App />);
