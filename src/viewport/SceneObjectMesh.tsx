import { useEffect, useRef } from 'react'
import { Edges } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'
import type { SceneObject } from './types'
import type { Transform } from '../store/useRunStore'

interface Props {
  obj: SceneObject
  selected: boolean
  /** When a run is active, the live physics transform overrides the editor pose. */
  live?: Transform
  /** Stable callback (useCallback) registering this group on mount, null on unmount. */
  onReady: (id: string, group: THREE.Object3D | null) => void
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}

/**
 * Renders one scene object.
 *
 * Pose is applied IMPERATIVELY in an effect, never via declarative
 * position/rotation/quaternion props. This is deliberate: drei's
 * TransformControls updates the attached object every frame, and if the object
 * is ALSO driven by declarative transform props the two fight — R3F reapplies
 * the prop, the gizmo overrides it, and rotation visibly resets to identity.
 * Applying imperatively (only when the pose values change) leaves the gizmo as
 * the sole owner during a drag, so edited rotations stick.
 *
 * - Editor mode: pose from obj.position + obj.rotation (Euler XYZ).
 * - Run mode: pose from the streamed live transform (position + quaternion).
 *   Floor is excluded from mirroring (its mesh bakes a local -90° rotation).
 */
export function SceneObjectMesh({ obj, selected, live, onReady, onPointerDown }: Props) {
  const isFloor = obj.type === 'floor'
  const mirrored = !!live && !isFloor

  const groupRef = useRef<THREE.Group>(null)

  // Apply pose when the values change. During a gizmo drag the store is not
  // touched (we sync only on drag-end), so this effect does not run mid-drag
  // and never fights the gizmo.
  useEffect(() => {
    const g = groupRef.current
    if (!g) return
    if (mirrored) {
      g.position.set(live!.pos[0], live!.pos[1], live!.pos[2])
      g.quaternion.set(live!.rot[0], live!.rot[1], live!.rot[2], live!.rot[3])
    } else {
      g.position.set(obj.position[0], obj.position[1], obj.position[2])
      g.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2])
    }
  }, [obj.position, obj.rotation, live, mirrored])

  // Register the group once on mount, unregister on unmount.
  useEffect(() => {
    onReady(obj.id, groupRef.current)
    return () => onReady(obj.id, null)
  }, [obj.id, onReady])

  return (
    <group ref={groupRef} onPointerDown={onPointerDown}>
      {obj.type === 'floor' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[obj.size, obj.size]} />
          <meshStandardMaterial color={obj.color} roughness={1} />
          {selected && <Edges color="#ffd24d" />}
        </mesh>
      )}

      {obj.type === 'target' && (
        <TargetMesh obj={obj} selected={selected} y={mirrored ? live!.pos[1] : obj.position[1]} />
      )}

      {(obj.type === 'cube' || obj.type === 'sphere' || obj.type === 'capsule') && (
        <mesh castShadow receiveShadow>
          {obj.type === 'cube' && <boxGeometry args={[obj.size, obj.size, obj.size]} />}
          {obj.type === 'sphere' && <sphereGeometry args={[obj.radius, 32, 32]} />}
          {obj.type === 'capsule' && (
            <capsuleGeometry args={[obj.radius * 0.5, obj.size, 12, 24]} />
          )}
          <meshStandardMaterial color={obj.color} roughness={0.5} metalness={0.1} />
          {selected && <Edges color="#ffd24d" />}
        </mesh>
      )}
    </group>
  )
}

/** Target = glowing sphere + a ground ring marker that stays on the floor. */
function TargetMesh({
  obj,
  selected,
  y,
}: {
  obj: SceneObject
  selected: boolean
  y: number
}) {
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[obj.radius, 32, 32]} />
        <meshStandardMaterial
          color={obj.color}
          emissive={obj.color}
          emissiveIntensity={0.6}
          roughness={0.3}
        />
        {selected && <Edges color="#ffd24d" />}
      </mesh>
      <mesh position={[0, 0.02 - y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[obj.radius * 1.25, obj.radius * 1.55, 48]} />
        <meshBasicMaterial color={obj.color} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}
