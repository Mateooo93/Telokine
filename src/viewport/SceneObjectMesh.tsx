import { Edges } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import type { SceneObject } from './types'

interface Props {
  obj: SceneObject
  selected: boolean
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
}

/**
 * Renders one scene object. Geometry/material derive from the object's type and
 * properties so that the editable model is the rendered model.
 */
export function SceneObjectMesh({ obj, selected, onPointerDown }: Props) {
  if (obj.type === 'floor') {
    return (
      <mesh position={obj.position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[obj.size, obj.size]} />
        <meshStandardMaterial color={obj.color} roughness={1} />
        {selected && <Edges color="#ffd24d" />}
      </mesh>
    )
  }

  if (obj.type === 'target') {
    return (
      <group position={obj.position} onPointerDown={onPointerDown}>
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
    )
  }

  return (
    <mesh position={obj.position} castShadow receiveShadow onPointerDown={onPointerDown}>
      {obj.type === 'cube' && <boxGeometry args={[obj.size, obj.size, obj.size]} />}
      {obj.type === 'sphere' && <sphereGeometry args={[obj.radius, 32, 32]} />}
      {obj.type === 'capsule' && <capsuleGeometry args={[obj.radius * 0.5, obj.size, 12, 24]} />}
      <meshStandardMaterial color={obj.color} roughness={0.5} metalness={0.1} />
      {selected && <Edges color="#ffd24d" />}
    </mesh>
  )
}
