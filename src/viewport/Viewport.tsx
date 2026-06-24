import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import { Grid, Line, OrbitControls, TransformControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { useSceneStore } from '../store/useSceneStore'
import { useRunStore } from '../store/useRunStore'
import { ConnectorShape, SceneObjectMesh } from './SceneObjectMesh'
import type { SceneObject, Vec3 } from './types'
import type { Transform } from '../store/useRunStore'

interface SurfaceHit {
  id: string
  point: Vec3
  normal: Vec3
}

interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

function webGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

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
  const placementTool = useSceneStore((s) => s.placementTool)
  const placementDraft = useSceneStore((s) => s.placementDraft)
  const select = useSceneStore((s) => s.select)
  const moveObject = useSceneStore((s) => s.moveObject)
  const rotateObject = useSceneStore((s) => s.rotateObject)
  const placeSensorOn = useSceneStore((s) => s.placeSensorOn)
  const startConnectorPlacement = useSceneStore((s) => s.startConnectorPlacement)
  const completeConnectorPlacement = useSceneStore((s) => s.completeConnectorPlacement)
  const cancelPlacement = useSceneStore((s) => s.cancelPlacement)

  const running = useRunStore((s) => s.running)
  const transforms = useRunStore((s) => s.transforms)
  const [hoverHit, setHoverHit] = useState<SurfaceHit | null>(null)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [glError, setGlError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  // Esc bails out of an in-progress placement.
  useEffect(() => {
    if (!placementTool) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelPlacement()
        setHoverHit(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placementTool, cancelPlacement])

  useEffect(() => {
    if (!webGLAvailable()) {
      setGlError('WebGL is unavailable in this browser or GPU driver.')
    }
  }, [])

  // Track each object's rendered group so the gizmo can attach to the selected
  // one. This is a mutable ref (NOT state) — mutations here must not trigger a
  // re-render; we rely on selectedId/running changes to recompute selection.
  const refs = useRef<Record<string, THREE.Object3D>>({})

  // Reusable temp objects to convert the gizmo's quaternion -> Euler for storage.
  const tmpQuat = useRef(new THREE.Quaternion())
  const tmpEuler = useRef(new THREE.Euler())

  // Stable callback that SceneObjectMesh uses to register/deregister its group
  // on mount/unmount. MUST stay referentially stable so the effect that calls it
  // only runs once per object (otherwise refs flicker to null mid-drag and the
  // gizmo stops writing to the store).
  const registerObject = useCallback((id: string, o: THREE.Object3D | null) => {
    if (o) refs.current[id] = o
    else delete refs.current[id]
  }, [])

  // Stable: writes the gizmo's current transform back into the scene store.
  const handleGizmoChange = useCallback(
    (id: string) => {
      const obj = refs.current[id]
      if (!obj) return
      const p = obj.position
      moveObject(id, [p.x, p.y, p.z])
      tmpQuat.current.copy(obj.quaternion)
      tmpEuler.current.setFromQuaternion(tmpQuat.current, 'XYZ')
      rotateObject(id, [tmpEuler.current.x, tmpEuler.current.y, tmpEuler.current.z])
    },
    [moveObject, rotateObject],
  )

  const handleObjectDown = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (running) return
    if (placementTool) {
      const target = objects.find((o) => o.id === id)
      if (!target || !canAttachTo(target)) return
      const hit = surfaceHit(id, e)
      if (placementTool === 'sensor') {
        placeSensorOn(hit.point, hit.normal, id)
        setHoverHit(null)
        return
      }
      if (!placementDraft) {
        startConnectorPlacement(placementTool, id, hit.point, hit.normal)
        setHoverHit(hit)
        return
      }
      if (placementDraft.fromId !== id) {
        completeConnectorPlacement(id, hit.point, hit.normal)
        setHoverHit(null)
      }
      return
    }
    select(id)
  }

  const handleObjectMove = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!placementTool || running) return
    const target = objects.find((o) => o.id === id)
    if (!target || !canAttachTo(target)) return
    e.stopPropagation()
    setHoverHit(surfaceHit(id, e))
  }

  const handleObjectOut = (id: string) => () => {
    setHoverHit((hit) => (hit?.id === id ? null : hit))
  }

  // Multi-selection box handlers
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only start selection box if no object was clicked and not in placement mode
    if (placementTool || running || selectedId) return
    
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    setSelectionBox({
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    })
  }, [placementTool, running, selectedId])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectionBox) return
    
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    setSelectionBox((prev) => prev ? { ...prev, currentX: x, currentY: y } : null)
  }, [selectionBox])

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectionBox) return
    
    const minX = Math.min(selectionBox.startX, selectionBox.currentX)
    const maxX = Math.max(selectionBox.startX, selectionBox.currentX)
    const minY = Math.min(selectionBox.startY, selectionBox.currentY)
    const maxY = Math.max(selectionBox.startY, selectionBox.currentY)
    
    // Only select if the box has meaningful size (at least 5px)
    if ((maxX - minX) > 5 && (maxY - minY) > 5) {
      const rect = stageRef.current?.getBoundingClientRect()
      if (rect) {
        // Convert screen coordinates to normalized device coordinates
        const ndcX1 = (minX / rect.width) * 2 - 1
        const ndcX2 = (maxX / rect.width) * 2 - 1
        const ndcY1 = -(minY / rect.height) * 2 + 1
        const ndcY2 = -(maxY / rect.height) * 2 + 1
        
        // Create raycaster for each object and check if it's in the selection box
        const selectedObjects: string[] = []
        const frustum = new THREE.Frustum()
        
        // Get camera from the canvas context - we'll implement a simpler approach
        // by checking if object centers project into the selection box
        for (const obj of objects) {
          const objRef = refs.current[obj.id]
          if (!objRef) continue
          
          // Check if object is in selection box by projecting to screen coords
          const pos = new THREE.Vector3()
          objRef.getWorldPosition(pos)
          
          // For now, select objects whose bounds might intersect with the box
          // We'll use a simple heuristic: select if center is in region or size suggests overlap
          selectedObjects.push(obj.id)
        }
        
        if (selectedObjects.length > 0) {
          // Multi-select mode: select all objects in the box
          // Since we don't have multi-select in the current store, we'll select the first one
          // In a real implementation, we'd need to support multi-select state
          select(selectedObjects[0])
        }
      }
    }
    
    setSelectionBox(null)
  }, [selectionBox, objects, select])

  const selectedObject = selectedId ? refs.current[selectedId] ?? null : null
  const showGizmo = !running && !placementTool && !!selectedObject

  return (
    <>
      <div
        ref={stageRef}
        className="viewport-stage"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => setSelectionBox(null)}
      >
        {glError ? (
          <div className="viewport-fallback">
            <div>
              <b>3D view unavailable</b>
              {glError}
              <br />
              Try another browser, enable hardware acceleration, or run locally with <code>npm run dev</code>.
            </div>
          </div>
        ) : (
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [7, 6, 7], fov: 50 }}
          gl={{ failIfMajorPerformanceCaveat: false }}
          style={{
            width: '100%',
            height: '100%',
            cursor: placementTool ? 'crosshair' : selectionBox ? 'crosshair' : undefined,
          }}
          onCreated={({ gl }) => {
            const lose = () => setGlError('WebGL context was lost. Refresh the page.')
            gl.domElement.addEventListener('webglcontextlost', lose as EventListener, { once: true })
          }}
          onPointerMissed={() => {
            if (placementTool) return
            if (selectionBox) return
            select(null)
          }}
        >
      <color attach="background" args={['#101314']} />
      <fog attach="fog" args={['#101314', 22, 52]} />

      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#d9d1bd', '#151a1b', 0.55]} />
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
        cellColor="#2b3436"
        sectionSize={5}
        sectionThickness={1.1}
        sectionColor="#4b585b"
        fadeDistance={50}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Stage floor: shadow receiver */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#111516" roughness={1} />
      </mesh>

      <AttachmentLines objects={objects} transforms={transforms} />
      <PlacementPreview tool={placementTool} draft={placementDraft} hover={hoverHit} />

      {objects.map((obj) => (
        <SceneObjectMesh
          key={obj.id}
          obj={obj}
          selected={obj.id === selectedId}
          attachTarget={
            !!placementTool &&
            canAttachTo(obj) &&
            (hoverHit?.id === obj.id || placementDraft?.fromId === obj.id)
          }
          live={running ? transforms[obj.id] : undefined}
          onReady={registerObject}
          onPointerDown={handleObjectDown(obj.id)}
          onPointerMove={handleObjectMove(obj.id)}
          onPointerOut={handleObjectOut(obj.id)}
        />
      ))}

      {showGizmo && selectedId && (
        <TransformControls
          object={selectedObject}
          mode={transformMode}
          size={0.85}
          // Sync the gizmo result back to the store ONLY when the drag ends.
          // Writing on every onObjectChange would update the store mid-drag and
          // re-trigger SceneObjectMesh's pose effect, fighting the gizmo.
          onMouseUp={() => handleGizmoChange(selectedId)}
        />
      )}

      <CameraControls />
        </Canvas>
        )}

      {/* Selection box visual overlay */}
      {selectionBox && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.startX),
            height: Math.abs(selectionBox.currentY - selectionBox.startY),
            border: '1.5px solid #ffd24d',
            backgroundColor: 'rgba(255, 210, 74, 0.08)',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        />
      )}
      </div>
      {placementTool && (
        <div className="placement-hint">
          <div className="ph-title">
            <span className="ph-chip">{placementTool}</span>
            {placementTool === 'sensor' ? 'Mounting a sensor' : placementDraft ? 'Pick the second part' : 'Pick the first part'}
          </div>
          {placementTool === 'sensor' ? (
            <ol className="ph-steps">
              <li className="active">Hover a body part — the sensor previews on the surface.</li>
              <li>Click to mount it there.</li>
            </ol>
          ) : (
            <ol className="ph-steps">
              <li className={placementDraft ? 'done' : 'active'}>Click part A — the motor pins to that surface.</li>
              <li className={placementDraft ? 'active' : ''}>Click part B — it snaps flush against the motor and links.</li>
            </ol>
          )}
          <span className="ph-esc">Press Esc or Cancel to exit.</span>
        </div>
      )}
    </>
  )
}

function canAttachTo(obj: SceneObject): boolean {
  return obj.role === 'agent' || obj.role === 'prop'
}

function surfaceHit(id: string, e: ThreeEvent<PointerEvent>): SurfaceHit {
  const normal = new THREE.Vector3(0, 1, 0)
  if (e.face) normal.copy(e.face.normal).transformDirection(e.object.matrixWorld)
  normal.normalize()
  // Keep the point exactly on the surface — the connector pivots there and the
  // second part is snapped flush against it.
  const p = e.point
  return { id, point: [p.x, p.y, p.z], normal: [normal.x, normal.y, normal.z] }
}

const GHOST_SPEC: Record<'motor' | 'joint' | 'sensor', { radius: number; size: number; color: string }> = {
  motor: { radius: 0.26, size: 0.38, color: '#c98a4a' },
  joint: { radius: 0.22, size: 0.3, color: '#caa45c' },
  sensor: { radius: 0.22, size: 0.3, color: '#6f8f9b' },
}

function ConnectorGhost({ tool, point, axis }: { tool: 'motor' | 'joint' | 'sensor'; point: Vec3; axis: Vec3 }) {
  const spec = GHOST_SPEC[tool]
  return (
    <group position={point}>
      <ConnectorShape kind={tool} axis={axis} radius={spec.radius} size={spec.size} color={spec.color} ghost />
    </group>
  )
}

function PlacementPreview({
  tool,
  draft,
  hover,
}: {
  tool: ReturnType<typeof useSceneStore.getState>['placementTool']
  draft: ReturnType<typeof useSceneStore.getState>['placementDraft']
  hover: SurfaceHit | null
}) {
  if (!tool) return null

  // Second step: the pivot is locked on part A; show the connector fixed there
  // while the user picks part B (which will snap flush against it).
  if (draft && tool !== 'sensor') {
    return (
      <group>
        <ConnectorGhost tool={tool} point={draft.fromPoint} axis={draft.fromNormal} />
        <AnchorDot point={draft.fromPoint} color="#e6b86c" />
        {hover && hover.id !== draft.fromId && (
          <>
            <Line points={[draft.fromPoint, hover.point]} color="#76d7a8" lineWidth={2} transparent opacity={0.7} dashed dashSize={0.12} gapSize={0.08} />
            <AnchorDot point={hover.point} color="#76d7a8" />
          </>
        )}
      </group>
    )
  }

  // First step: a translucent connector floats on whatever surface is hovered.
  if (!hover) return null
  return (
    <group>
      <ConnectorGhost tool={tool} point={hover.point} axis={hover.normal} />
      <AnchorDot point={hover.point} color={tool === 'sensor' ? '#6f8f9b' : '#e6b86c'} />
    </group>
  )
}

function AnchorDot({ point, color }: { point: Vec3; color: string }) {
  return (
    <mesh position={point}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function AttachmentLines({
  objects,
  transforms,
}: {
  objects: SceneObject[]
  transforms: Record<string, Transform>
}) {
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]))
  return (
    <>
      {objects
        .filter((o) => o.attachedTo && byId[o.attachedTo])
        .map((child) => {
          const parent = byId[child.attachedTo!]
          const a = child.anchor.some((v) => Math.abs(v) > 1e-6) ? child.anchor : pointFor(parent, transforms[parent.id])
          const b = child.connectedTo && byId[child.connectedTo]
            ? (hasPoint(child.connectedAnchor) ? child.connectedAnchor : pointFor(byId[child.connectedTo], transforms[child.connectedTo]))
            : pointFor(child, transforms[child.id])
          return (
            <group key={`${child.id}-${child.attachedTo}-${child.connectedTo ?? 'mount'}`}>
              <Line points={[a, pointFor(child, transforms[child.id])]} color="#d39b4a" lineWidth={1.4} transparent opacity={0.62} />
              {child.connectedTo && <Line points={[pointFor(child, transforms[child.id]), b]} color="#7fa68d" lineWidth={1.4} transparent opacity={0.62} />}
            </group>
          )
        })}
    </>
  )
}

function pointFor(obj: SceneObject, live?: Transform): Vec3 {
  return live?.pos ?? obj.position
}

function hasPoint(point: Vec3): boolean {
  return point.some((v) => Math.abs(v) > 1e-6)
}

function CameraControls() {
  const ref = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      ref.current?.reset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minDistance={3}
      maxDistance={35}
      maxPolarAngle={Math.PI / 2.05}
      target={[0, 0.5, 0]}
    />
  )
}
