/**
 * The same React bundle serves three windows:
 *   #float    -> the small always-on-top orb
 *   #compose  -> the "Complete my text" popup next to the caret in other apps
 *   #launcher -> the quick launcher search bar (A8)
 *   #main     -> everything else
 */
import { ComposeApp } from './ComposeApp'
import { FloatApp } from './FloatApp'
import { MainApp } from './MainApp'
import { LauncherApp } from './LauncherApp'

export default function App() {
  if (window.location.hash === '#compose') return <ComposeApp />
  if (window.location.hash === '#launcher') return <LauncherApp />
  return window.location.hash === '#float' ? <FloatApp /> : <MainApp />
}