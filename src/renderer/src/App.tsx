/**
 * The same React bundle serves two windows:
 *   #float   -> the small always-on-top orb
 *   #compose -> the "Complete my text" popup next to the caret in other apps
 *   #main  -> everything else
 */
import { ComposeApp } from './ComposeApp'
import { FloatApp } from './FloatApp'
import { MainApp } from './MainApp'

export default function App() {
  if (window.location.hash === '#compose') return <ComposeApp />
  return window.location.hash === '#float' ? <FloatApp /> : <MainApp />
}
