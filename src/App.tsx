import { Palette } from './components/Palette'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { Inspector } from './components/Inspector'
import { TrainingOverlay } from './components/TrainingOverlay'
import { Viewport } from './viewport/Viewport'
import { BlockCanvas } from './components/BlockCanvas'

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Palette />
        <div className="workspace">
          <div className="viewport">
            <Viewport />
            <StatusBar />
            <TrainingOverlay />
          </div>
          <BlockCanvas />
        </div>
        <Inspector />
      </div>
    </div>
  )
}
