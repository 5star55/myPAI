import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Windows keep running while hidden (hands-free voice needs it), so pause the animations ourselves.
const setHidden = (hidden: boolean) => document.documentElement.classList.toggle('is-hidden', hidden)
document.addEventListener('visibilitychange', () => setHidden(document.hidden))
window.pai.on('window:visibility', ({ hidden }) => setHidden(hidden))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
