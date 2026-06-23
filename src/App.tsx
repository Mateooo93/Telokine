import { Palette } from './components/Palette'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { Viewport } from './viewport/Viewport'

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <Palette />
      <div className="viewport">
        <Viewport />
        <StatusBar />
      </div>
    </div>
  )
}
