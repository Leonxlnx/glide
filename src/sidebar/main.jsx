import '@fontsource-variable/geist';
import '../styles/sidebar.css';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import { boot } from './state';

boot().then(() => {
  createRoot(document.getElementById('root')).render(
    <MotionConfig reducedMotion="never">
      <App />
    </MotionConfig>,
  );
});
