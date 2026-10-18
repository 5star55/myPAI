/**
 * The same React bundle serves two windows:
 *   #float -> the small always-on-top orb
 *   #main  -> everything else
 */
import { FloatApp } from './FloatApp'
import { MainApp } from './MainApp'

export default function App() {
  return window.location.hash === '#float' ? <FloatApp /> : <MainApp />
}
