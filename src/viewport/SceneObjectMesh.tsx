import { useEffect, useMemo, useRef } from 'react'
import { Edges } from '@react-three/drei'
import { type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { ObjectType, SceneObject, Vec3 } from './types'
import type { Transform } from '../store/useRunStore'

const UP = new THREE.Vector3(0, 1, 0)

/** Quaternion that points the local +Y axis along the given world direction. */
function useAxisQuaternion(axis: Vec3): THREE.Quaternion {
  return useMemo(() => {
    const dir = new THREE.Vector3(axis[0], axis[1], axis[2])
    if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0)
    dir.normalize()
    return new THREE.Quaternion().setFromUnitVectors(UP, dir)
  }, [axis[0], axis[1], axis[2]])
}

/**
 * The shared look for connectors (motor / joint / sensor), oriented along the
 * spin axis. Used both for placed parts and for the translucent placement
 * ghost, so the preview matches exactly what you get.
 */
export function ConnectorShape({
  kind,
  axis,
  radius,
  size,
  color,
  ghost = false,
  selected = false,
}: {
  kind: Extract<ObjectType, 'motor' | 'joint' | 'sensor'>
  axis: Vec3
  radius: number
  size: number
  color: string
  ghost?: boolean
  selected?: boolean
}) {
  const quat = useAxisQuaternion(axis)
  const opacity = ghost ? 0.45 : 1
  const housing = size * 1.7

  if (kind === 'sensor') {
    return (
      <group>
        <mesh castShadow={!ghost}>
          <sphereGeometry args={[radius, 28, 28]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={ghost ? 0.3 : 0.55}
            roughness={0.3}
            transparent={ghost}
            opacity={opacity}
            depthWrite={!ghost}
          />
          {selected && <Edges color="#ffd24d" />}
        </mesh>
        <mesh quaternion={quat}>
          <torusGeometry args={[radius * 1.5, radius * 0.12, 10, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} transparent opacity={opacity * 0.8} depthWrite={false} />
        </mesh>
      </group>
    )
  }

  // motor / joint: a hub on an axle. The motor reads as a chunky housing; the
  // joint as a slim pivot pin. Both clearly show the rotation axis.
  return (
    <group quaternion={quat}>
      <mesh castShadow={!ghost}>
        <cylinderGeometry args={[radius, radius, housing, 28]} />
        <meshStandardMaterial
          color={color}
          metalness={kind === 'motor' ? 0.55 : 0.4}
          roughness={0.4}
          transparent={ghost}
          opacity={opacity}
          depthWrite={!ghost}
        />
        {selected && <Edges color="#ffd24d" />}
      </mesh>
      {kind === 'motor' && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0, (housing / 2) * s, 0]}>
              <cylinderGeometry args={[radius * 1.04, radius * 1.04, housing * 0.16, 28]} />
              <meshStandardMaterial color="#1b1e20" metalness={0.6} roughness={0.5} transparent={ghost} opacity={opacity} depthWrite={!ghost} />
            </mesh>
          ))}
        </>
      )}
      <mesh>
        <cylinderGeometry args={[radius * 0.26, radius * 0.26, housing * 1.9, 16]} />
        <meshStandardMaterial color="#e6cf95" metalness={0.7} roughness={0.3} transparent={ghost} opacity={opacity} depthWrite={!ghost} />
      </mesh>
    </group>
  )
}

interface Props {
  obj: SceneObject
  selected: boolean
  /** Highlighted as a valid attach target while a connector tool is active. */
  attachTarget?: boolean
  /** When a run is active, the live physics transform overrides the editor pose. */
  live?: Transform
  /** Stable callback (useCallback) registering this group on mount, null on unmount. */
  onReady: (id: string, group: THREE.Object3D | null) => void
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void
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
export function SceneObjectMesh({ obj, selected, attachTarget = false, live, onReady, onPointerDown, onPointerMove, onPointerOut }: Props) {
  const isFloor = obj.type === 'floor'
  const mirrored = !!live && !isFloor
  const outline = selected ? '#ffd24d' : attachTarget ? '#76d7a8' : null

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
    <group ref={groupRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
      {obj.type === 'floor' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[obj.size, obj.size]} />
          <meshStandardMaterial color={obj.color} roughness={1} />
          {outline && <Edges color={outline} />}
        </mesh>
      )}

      {obj.type === 'target' && (
        <TargetMesh obj={obj} selected={selected} y={mirrored ? live!.pos[1] : obj.position[1]} />
      )}

      {(obj.type === 'cube' || obj.type === 'sphere' || obj.type === 'capsule' || obj.type === 'beam') && (
        <mesh castShadow receiveShadow>
          {(obj.type === 'cube' || obj.type === 'beam') && (
            <boxGeometry args={[obj.dimensions[0], obj.dimensions[1], obj.dimensions[2]]} />
          )}
          {obj.type === 'sphere' && <sphereGeometry args={[obj.radius, 32, 32]} />}
          {obj.type === 'capsule' && (
            <capsuleGeometry args={[obj.radius * 0.5, obj.size, 12, 24]} />
          )}
          <meshStandardMaterial color={obj.color} roughness={0.5} metalness={0.1} />
          {outline && <Edges color={outline} />}
        </mesh>
      )}

      {obj.type === 'wheel' && (
        // Spin axis is local Z, so a wheel with no rotation rolls toward +X.
        // Add a stripe to visualize rotation
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[obj.radius, obj.radius, obj.size, 40]} />
            <meshStandardMaterial color={obj.color} roughness={0.65} metalness={0.15} />
            {outline && <Edges color={outline} />}
          </mesh>
          {/* Rotation indicator stripe */}
          <mesh position={[obj.radius * 0.85, 0, 0]}>
            <boxGeometry args={[obj.radius * 0.3, obj.size * 1.05, obj.radius * 0.18]} />
            <meshStandardMaterial
              color="#ffd24d"
              emissive="#ffd24d"
              emissiveIntensity={0.6}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        </group>
      )}

      {(obj.type === 'joint' || obj.type === 'motor' || obj.type === 'sensor') && (
        <ConnectorShape
          kind={obj.type}
          axis={obj.axis}
          radius={obj.radius}
          size={obj.size}
          color={obj.color}
          selected={selected}
        />
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
