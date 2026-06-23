import { Edges } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import type { SceneObject } from './types'
import type { Transform } from '../store/useRunStore'

interface Props {
  obj: SceneObject
  selected: boolean
  /** When a run is active, the live physics transform overrides the editor pose. */
  live?: Transform
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}

/**
 * Renders one scene object. In editor mode it uses the object's stored
 * position; while a rollout is running it mirrors the physics transform
 * streamed from the backend. Floor objects are excluded from mirroring
 * because their mesh bakes a local -90° rotation.
 */
export function SceneObjectMesh({ obj, selected, live, onPointerDown }: Props) {
  const isFloor = obj.type === 'floor'
  const mirrored = live && !isFloor

  // Default to identity rotation so the pose always resets cleanly when a run ends.
  const position: [number, number, number] = mirrored ? live!.pos : obj.position
  const quaternion: [number, number, number, number] = mirrored ? live!.rot : [0, 0, 0, 1]

  return (
    <group position={position} quaternion={quaternion} onPointerDown={onPointerDown}>
      {obj.type === 'floor' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[obj.size, obj.size]} />
          <meshStandardMaterial color={obj.color} roughness={1} />
          {selected && <Edges color="#ffd24d" />}
        </mesh>
      )}

      {obj.type === 'target' && (
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
          {/* ground marker ring so the target is readable from any angle */}
          <mesh position={[0, 0.02 - obj.position[1], 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[obj.radius * 1.25, obj.radius * 1.55, 48]} />
            <meshBasicMaterial color={obj.color} transparent opacity={0.5} />
          </mesh>
        </group>
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
