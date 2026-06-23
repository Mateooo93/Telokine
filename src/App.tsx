import { Palette } from './components/Palette'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { Inspector } from './components/Inspector'
import { Viewport } from './viewport/Viewport'

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Palette />
        <div className="viewport">
          <Viewport />
          <StatusBar />
        </div>
        <Inspector />
      </div>
    </div>
  )
}
