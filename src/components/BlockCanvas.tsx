import { useCallback, useEffect, useMemo } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import { rewardPayload, useProgramStore, type BlockKind, type ProgramBlock } from '../store/useProgramStore'

const CATALOG: { kind: BlockKind; label: string; blocks: string[] }[] = [
  { kind: 'sensor', label: 'Sensors', blocks: ['Distance To Target', 'Agent Velocity', 'Upright Vector', 'Contact State'] },
  { kind: 'logic', label: 'Logic', blocks: ['Normalize', 'Gate If Upright', 'Distance Delta'] },
  { kind: 'reward', label: 'Rewards', blocks: ['Approach Target', 'Reach Target', 'Stay Upright', 'Move Forward'] },
  { kind: 'penalty', label: 'Penalties', blocks: ['Fall', 'Touch Wall', 'Move Backward', 'Exertion'] },
  { kind: 'control', label: 'Control', blocks: ['PPO Policy', 'Torque Mixer', 'Joint Limits'] },
]

// Plain-language explanation of what each block does, shown on the node itself
// and as a tooltip in the library. Reward/penalty wording mirrors the backend
// reward terms in reward.py so the editor never lies about behavior.
const BLOCK_INFO: Record<string, string> = {
  // sensors
  'Distance To Target': 'Measures how far the agent is from the goal.',
  'Agent Velocity': "Reads the agent's current speed and heading.",
  'Upright Vector': 'Tracks how upright the agent is (1 = level).',
  'Contact State': 'Detects when the agent touches the ground or a wall.',
  // logic
  Normalize: 'Scales an incoming signal into a tidy 0–1 range.',
  'Gate If Upright': 'Only passes the signal through while the agent stays upright.',
  'Distance Delta': 'How much closer the agent got since the last step (progress).',
  // rewards
  'Approach Target': 'Rewards every bit of progress made toward the target.',
  'Reach Target': 'Big bonus the moment the agent reaches the target.',
  'Stay Upright': 'Rewards keeping the agent balanced and level.',
  'Move Forward': 'Rewards forward travel along its facing direction.',
  // penalties
  Fall: 'Penalizes tipping over or dropping to the floor.',
  'Touch Wall': 'Penalizes driving out of the arena bounds.',
  'Move Backward': 'Penalizes sliding backward, away from the goal.',
  Exertion: 'Penalizes heavy control effort — pushes for efficient motion.',
  // control
  'PPO Policy': 'The brain being trained — it optimizes the connected rewards.',
  'Torque Mixer': 'Blends the policy output across the agent’s motors.',
  'Joint Limits': 'Keeps joint motion inside safe, realistic ranges.',
}

type ProgramNodeData = {
  block: ProgramBlock
  onRemove: (id: string) => void
  onWeight: (id: string, weight: number) => void
}

type ProgramFlowNode = Node<ProgramNodeData, 'program'>
type ProgramFlowEdge = Edge

const nodeTypes = { program: ProgramNode }

export function BlockCanvas() {
  const blocks = useProgramStore((s) => s.blocks)
  const connections = useProgramStore((s) => s.connections)
  const addBlock = useProgramStore((s) => s.addBlock)
  const removeBlock = useProgramStore((s) => s.removeBlock)
  const moveBlock = useProgramStore((s) => s.moveBlock)
  const addConnection = useProgramStore((s) => s.addConnection)
  const removeConnection = useProgramStore((s) => s.removeConnection)
  const setBlockWeight = useProgramStore((s) => s.setBlockWeight)
  const loadTemplate = useProgramStore((s) => s.loadTemplate)
  const totalTimesteps = useProgramStore((s) => s.totalTimesteps)
  const episodeLength = useProgramStore((s) => s.episodeLength)
  const actionPower = useProgramStore((s) => s.actionPower)
  const curriculum = useProgramStore((s) => s.curriculum)
  const setTrainingParam = useProgramStore((s) => s.setTrainingParam)
  const rewards = rewardPayload(blocks)

  const storeNodes = useMemo<ProgramFlowNode[]>(
    () =>
      blocks.map((block) => ({
        id: block.id,
        type: 'program',
        position: { x: block.x, y: block.y },
        data: { block, onRemove: removeBlock, onWeight: setBlockWeight },
      })),
    [blocks, removeBlock, setBlockWeight],
  )

  const storeEdges = useMemo<ProgramFlowEdge[]>(
    () =>
      connections.map((c) => ({
        id: c.id,
        source: c.from,
        target: c.to,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#d39b4a' },
        style: { stroke: '#d39b4a', strokeWidth: 2 },
      })),
    [connections],
  )

  const [nodes, setNodes, applyNodeChanges] = useNodesState<ProgramFlowNode>(storeNodes)
  const [edges, setEdges, applyEdgeChanges] = useEdgesState<ProgramFlowEdge>(storeEdges)

  useEffect(() => setNodes(storeNodes), [setNodes, storeNodes])
  useEffect(() => setEdges(storeEdges), [setEdges, storeEdges])

  const onNodesChange = useCallback(
    (changes: NodeChange<ProgramFlowNode>[]) => {
      applyNodeChanges(changes)
      for (const change of changes) {
        if (change.type === 'remove') {
          removeBlock(change.id)
        }
      }
    },
    [applyNodeChanges, removeBlock],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<ProgramFlowEdge>[]) => {
      applyEdgeChanges(changes)
      for (const change of changes) {
        if (change.type === 'remove') removeConnection(change.id)
      }
    },
    [applyEdgeChanges, removeConnection],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) addConnection(connection.source, connection.target)
    },
    [addConnection],
  )

  return (
    <section className="block-workbench" aria-label="Training block workbench">
      <div className="block-sidebar">
        <div className="panel-head">
          <span>Block Library</span>
          <span className="count">{blocks.length}</span>
        </div>
        <div className="template-row">
          <button onClick={() => loadTemplate('reach')}>Reach</button>
          <button onClick={() => loadTemplate('upright')}>Upright</button>
          <button onClick={() => loadTemplate('efficient')}>Efficient</button>
        </div>
        <div className="block-catalog">
          {CATALOG.map((group) => (
            <details key={group.label} open={group.kind !== 'logic'}>
              <summary>{group.label}</summary>
              {group.blocks.map((name) => (
                <button key={name} onClick={() => addBlock(group.kind, name)} title={BLOCK_INFO[name] ?? ''}>
                  {name}
                </button>
              ))}
            </details>
          ))}
        </div>
      </div>

      <div className="node-canvas">
        <div className="canvas-toolbar">
          <div>
            <b>Reward Program</b>
            <span>Drag blocks. Pull from a right output dot into a left input dot. Select an edge and press Delete.</span>
          </div>
          <div className="connection-readout">
            {connections.length} links · {rewards.length} reward terms
          </div>
        </div>
        <ReactFlow<ProgramFlowNode, ProgramFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={(_, node) => moveBlock(node.id, node.position)}
          fitView
          minZoom={0.55}
          maxZoom={1.35}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background color="#2d3638" gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={2} />
        </ReactFlow>
      </div>

      <div className="training-panel">
        <div className="panel-head">
          <span>Training Setup</span>
          <span className="count">PPO</span>
        </div>
        <Metric label="Timesteps" value={totalTimesteps.toLocaleString()} />
        <Range
          label="Budget"
          hint="Total practice steps. More = smarter behavior but longer training."
          value={totalTimesteps} min={25_000} max={300_000} step={25_000}
          onValue={(v) => setTrainingParam('totalTimesteps', v)}
        />
        <Range
          label="Episode"
          hint="How many steps each try lasts before the agent resets and starts over."
          value={episodeLength} min={100} max={500} step={25}
          onValue={(v) => setTrainingParam('episodeLength', v)}
        />
        <Range
          label="Action power"
          hint="How hard the agent can push and turn. Higher = stronger, but twitchier."
          value={actionPower} min={0.25} max={2} step={0.05} decimals={2}
          onValue={(v) => setTrainingParam('actionPower', v)}
        />
        <Range
          label="Curriculum"
          hint="How much easier early tries start, then ramp up to full difficulty. 0 = full difficulty from the start."
          value={curriculum} min={0} max={1} step={0.05} decimals={2}
          onValue={(v) => setTrainingParam('curriculum', v)}
        />
        <div className="reward-summary">
          {rewards.map((r) => (
            <span key={r.id} className={r.kind}>
              {r.name} {r.kind === 'penalty' ? '-' : '+'}{r.weight.toFixed(1)}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProgramNode({ data }: NodeProps<ProgramFlowNode>) {
  const { block, onRemove, onWeight } = data
  const weighted = block.kind === 'reward' || block.kind === 'penalty'
  const info = BLOCK_INFO[block.name] ?? (block.kind === 'control' ? 'Optimizes the connected rewards.' : 'Feeds downstream blocks.')

  return (
    <div className={`program-node ${block.kind}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-top">
        <span>{block.kind}</span>
        <button className="nodrag node-remove" onClick={() => onRemove(block.id)} title="Remove block" aria-label="Remove block">
          ×
        </button>
      </div>
      <b>{block.name}</b>
      <small className="node-desc">{info}</small>
      {weighted && (
        <label className="nodrag">
          <span>Weight {block.weight.toFixed(1)}</span>
          <input
            type="range"
            value={block.weight}
            min={0}
            max={5}
            step={0.1}
            onChange={(e) => onWeight(block.id, parseFloat(e.target.value))}
          />
        </label>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function Range({
  label,
  hint,
  value,
  min,
  max,
  step,
  decimals = 0,
  onValue,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  decimals?: number
  onValue: (value: number) => void
}) {
  return (
    <label className="compact-range" title={hint ?? ''}>
      <span>
        {label} <em>{decimals ? value.toFixed(decimals) : value.toLocaleString()}</em>
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onValue(parseFloat(e.target.value))} />
      {hint && <small className="range-hint">{hint}</small>}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
