import './styles/tokens.css';
import './styles/base.css';
import './styles/glass.css';
import './styles/components.css';
import './styles/motion.css';
import { mountApp } from './ui/app';
import { warm } from './workers/client';

mountApp();

// Start the worker and build the taxonomy index once the page is idle, so the first analysis is instant.
const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
idle(() => void warm());
