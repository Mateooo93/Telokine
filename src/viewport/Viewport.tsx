import { useRef } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Grid, OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { SceneObjectMesh } from './SceneObjectMesh'

/**
 * The 3D viewport — Layer 1.
 * - Editor mode: objects are driven by the zustand scene store; a transform
 *   gizmo moves/rotates the selected object.
 * - Run mode: objects mirror transforms streamed from the Python sim; the
 *   gizmo is hidden because physics owns the poses then.
 */
export function Viewport() {
  const objects = useSceneStore((s) => s.objects)
  const selectedId = useSceneStore((s) => s.selectedId)
  const transformMode = useSceneStore((s) => s.transformMode)
  const select = useSceneStore((s) => s.select)
  const moveObject = useSceneStore((s) => s.moveObject)
  const rotateObject = useSceneStore((s) => s.rotateObject)

  const running = useRunStore((s) => s.running)
  const transforms = useRunStore((s) => s.transforms)

  // Track each object's rendered group so the gizmo can attach to the selected one.
  const refs = useRef<Record<string, THREE.Object3D>>({})

  // Reusable temp objects to convert the gizmo's quaternion -> Euler for storage.
  const tmpQuat = useRef(new THREE.Quaternion())
  const tmpEuler = useRef(new THREE.Euler())

  const handleGizmoChange = (id: string) => {
    const obj = refs.current[id]
    if (!obj) return
    const p = obj.position
    moveObject(id, [p.x, p.y, p.z])
    tmpQuat.current.copy(obj.quaternion)
    tmpEuler.current.setFromQuaternion(tmpQuat.current, 'XYZ')
    rotateObject(id, [tmpEuler.current.x, tmpEuler.current.y, tmpEuler.current.z])
  }

  const handleObjectDown = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (running) return
    select(id)
  }

  const selectedObject = selectedId
    ? refs.current[selectedId]
    : null
  const showGizmo = !running && !!selectedObject

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

      {/* Stage floor: shadow receiver */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#12141b" roughness={1} />
      </mesh>

      {objects.map((obj) => (
        <SceneObjectMesh
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedId}
          live={transforms[obj.id]}
          onReady={(o) => {
            if (o) refs.current[obj.id] = o
            else delete refs.current[obj.id]
          }}
          onPointerDown={handleObjectDown(obj.id)}
        />
      ))}

      {showGizmo && (
        <TransformControls
          object={selectedObject}
          mode={transformMode}
          size={0.85}
          // Re-read the object's transform into the store on every gizmo change.
          onObjectChange={() => selectedId && handleGizmoChange(selectedId)}
        />
      )}

      <OrbitControls
        makeDefault
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
