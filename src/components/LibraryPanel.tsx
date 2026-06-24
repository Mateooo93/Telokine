import { useEffect, useState } from 'react'
import { usePersistenceStore } from '../store/usePersistenceStore'
import { useTrainingStore } from '../store/useTrainingStore'
import { useRunStore } from '../store/useRunStore'
import { useProgramStore } from '../store/useProgramStore'

interface Props {
  isOpen: boolean
  onClose: () => void
}

/**
 * Modal for saving/loading trained policies and block configurations.
 * Allows the user to browse, save, delete, and load previously saved items.
 */
export function LibraryPanel({ isOpen, onClose }: Props) {
  const [tab, setTab] = useState<'policies' | 'blocks'>('policies')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const persistence = usePersistenceStore()
  const blocks = useProgramStore((s) => s.blocks)
  const setBlocks = useProgramStore((s) => s.setBlocks)

  useEffect(() => {
    if (isOpen) {
      persistence.loadPolicies()
      persistence.loadBlocks()
    }
  }, [isOpen, persistence])

  const handleSaveBlockConfig = async () => {
    if (!newName.trim()) {
      persistence.setError('Please enter a name')
      return
    }
    setSaving(true)
    try {
      await persistence.saveBlocks(newName, blocks)
      setNewName('')
    } finally {
      setSaving(false)
    }
  }

  const handleLoadBlockConfig = async (name: string) => {
    const loadedBlocks = await persistence.loadBlockConfig(name)
    if (loadedBlocks) {
      setBlocks(loadedBlocks)
      onClose()
    }
  }

  const handleLoadPolicy = (policyName: string) => {
    // Set the policy in the training store to use it
    useTrainingStore.setState({ policyName })
    onClose()
  }

  if (!isOpen) return null

  const formatDate = (ts: number) => new Date(ts * 1000).toLocaleDateString()
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  return (
    <>
      <div className="library-overlay" onClick={onClose}>
        <div className="library-panel" onClick={(e) => e.stopPropagation()}>
          <div className="library-header">
            <h2>Library</h2>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="library-tabs">
            <button className={`tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => setTab('policies')}>
              Trained Policies
            </button>
            <button className={`tab ${tab === 'blocks' ? 'active' : ''}`} onClick={() => setTab('blocks')}>
              Block Configurations
            </button>
          </div>

          {persistence.error && <div className="error-banner">{persistence.error}</div>}

          <div className="library-content">
            {tab === 'policies' && (
              <div className="policy-list">
                <h3>Trained Models</h3>
                {persistence.loading ? (
                  <p className="loading">Loading policies...</p>
                ) : persistence.policies.length === 0 ? (
                  <p className="empty">No trained policies yet. Train a model to save it.</p>
                ) : (
                  <div className="list">
                    {persistence.policies.map((p) => (
                      <div key={p.name} className="list-item">
                        <div className="item-info">
                          <div className="item-name">{p.name}</div>
                          <div className="item-meta">
                            {formatSize(p.size)} • {formatDate(p.created)}
                          </div>
                        </div>
                        <div className="item-actions">
                          <button onClick={() => handleLoadPolicy(p.name)} className="btn-small">
                            Load
                          </button>
                          <button
                            onClick={() => persistence.deletePolicy(p.name)}
                            className="btn-small btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'blocks' && (
              <div className="blocks-list">
                <h3>Block Configurations</h3>

                <div className="save-section">
                  <div className="save-input">
                    <input
                      type="text"
                      placeholder="Configuration name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveBlockConfig()}
                    />
                    <button
                      onClick={handleSaveBlockConfig}
                      disabled={saving || !newName.trim() || blocks.length === 0}
                      className="btn"
                      title={blocks.length === 0 ? 'Create blocks before saving' : 'Save current block configuration'}
                    >
                      {saving ? 'Saving...' : 'Save Current'}
                    </button>
                  </div>
                </div>

                {persistence.loading ? (
                  <p className="loading">Loading configurations...</p>
                ) : persistence.blocks.length === 0 ? (
                  <p className="empty">No saved configurations yet. Create blocks and save them.</p>
                ) : (
                  <div className="list">
                    {persistence.blocks.map((b) => (
                      <div key={b.name} className="list-item">
                        <div className="item-info">
                          <div className="item-name">{b.name}</div>
                          <div className="item-meta">{formatDate(b.created)}</div>
                        </div>
                        <div className="item-actions">
                          <button onClick={() => handleLoadBlockConfig(b.name)} className="btn-small">
                            Load
                          </button>
                          <button
                            onClick={() => persistence.deleteBlocks(b.name)}
                            className="btn-small btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
