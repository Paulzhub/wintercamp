import '@fontsource/anton/latin-400.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import './styles/main.css';
import { guardFrame } from './js/frame-guard.js';
import { bootPlain } from './js/plain.js';

if (!guardFrame()) bootPlain();
