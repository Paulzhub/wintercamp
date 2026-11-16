import '@fontsource/anton/latin-400.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import 'lenis/dist/lenis.css';
import './styles/main.css';
import { guardFrame } from './js/frame-guard.js';
import { boot } from './js/app.js';

if (!guardFrame()) boot();
