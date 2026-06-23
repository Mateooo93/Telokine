import { useEffect, useRef, useState } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { SceneObjectMesh } from './SceneObjectMesh'

/**
 * The 3D viewport — Layer 1. In the editor this renders the scene from the
 * zustand store. During training it will instead mirror transforms streamed
 * from the Python sim. Same canvas, two data sources.
 */
export function Viewport() {
  const objects = useSceneStore((s) => s.objects)
  const selectedId = useSceneStore((s) => s.selectedId)
  const select = useSceneStore((s) => s.select)
  const moveObject = useSceneStore((s) => s.moveObject)

  const running = useRunStore((s) => s.running)
  const transforms = useRunStore((s) => s.transforms)

  // Drag-to-move state. OrbitControls is disabled while dragging an object so
  // the pointer can move it across the floor. Dragging is disabled entirely
  // during a run — the physics owns the object positions then.
  const dragId = useRef<string | null>(null)
  const [orbitEnabled, setOrbitEnabled] = useState(true)

  useEffect(() => {
    const onUp = () => {
      if (dragId.current) {
        dragId.current = null
        setOrbitEnabled(true)
      }
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [])

  const handleObjectDown = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (running) return
    select(id)
    dragId.current = id
    setOrbitEnabled(false)
  }

  const handleFloorMove = (e: ThreeEvent<PointerEvent>) => {
    if (running) return
    const id = dragId.current
    if (!id) return
    const obj = useSceneStore.getState().objects.find((o) => o.id === id)
    if (!obj) return
    moveObject(id, [e.point.x, obj.position[1], e.point.z])
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [7, 6, 7], fov: 50 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#0e0f15']} />
      <fog attach="fog" args={['#0e0f15', 22, 52]} />

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#9fb4ff', '#1a1d28', 0.55]} />
      <directionalLight
        position={[7, 11, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-bias={-0.0001}
      />

      <Grid
        position={[0, 0.002, 0]}
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#262b3a"
        sectionSize={5}
        sectionThickness={1.1}
        sectionColor="#3a4258"
        fadeDistance={50}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Stage floor: shadow receiver + drag surface */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onPointerMove={handleFloorMove}
        onPointerDown={() => select(null)}
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#12141b" roughness={1} />
      </mesh>

      {objects.map((obj) => (
        <SceneObjectMesh
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedId}
          live={transforms[obj.id]}
          onPointerDown={handleObjectDown(obj.id)}
        />
      ))}

      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.12}
        minDistance={3}
        maxDistance={35}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 0.5, 0]}
      />
    </Canvas>
  )
}
