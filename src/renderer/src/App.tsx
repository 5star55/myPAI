/**
 * The same React bundle serves two windows:
 *   #float   -> the small always-on-top orb
 *   #compose -> the "Complete my text" popup next to the caret in other apps
 *   #preview -> the toolbar of the preview browser (the app being built)
 *   #main  -> everything else
 */
import { ComposeApp } from './ComposeApp'
import { FloatApp } from './FloatApp'
import { MainApp } from './MainApp'
import { PreviewApp } from './PreviewApp'

export default function App() {
  if (window.location.hash === '#compose') return <ComposeApp />
  if (window.location.hash === '#preview') return <PreviewApp />
  return window.location.hash === '#float' ? <FloatApp /> : <MainApp />
}
