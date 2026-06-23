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
 * - Editor mode: pose comes from the object's position + rotation (Euler XYZ).
 * - Run mode: pose comes from the live physics transform (position + quaternion
 *   streamed from the backend). Floor is excluded from mirroring because its
 *   mesh bakes a local -90° rotation.
 *
 * The group registers itself once (on mount) via a stable internal ref, so the
 * gizmo always has a valid handle to it — never null mid-drag.
 */
export function SceneObjectMesh({ obj, selected, live, onReady, onPointerDown }: Props) {
  const isFloor = obj.type === 'floor'
  const mirrored = !!live && !isFloor

  // Editor pose (Euler XYZ) vs live physics pose (quaternion). Mutually exclusive.
  const groupProps = mirrored
    ? { position: live!.pos, quaternion: live!.rot }
    : { position: obj.position, rotation: obj.rotation }

  const groupRef = useRef<THREE.Group>(null)
  useEffect(() => {
    onReady(obj.id, groupRef.current)
    return () => onReady(obj.id, null)
  }, [obj.id, onReady])

  return (
    <group {...groupProps} ref={groupRef} onPointerDown={onPointerDown}>
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
