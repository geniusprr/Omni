import { useMemo, useState } from 'react'
import ArrowDownLeft from 'lucide-react/dist/esm/icons/arrow-down-left.js'
import ArrowUpRight from 'lucide-react/dist/esm/icons/arrow-up-right.js'
import FileText from 'lucide-react/dist/esm/icons/file-text.js'
import Link2 from 'lucide-react/dist/esm/icons/link-2.js'
import { tabStore } from '../stores/tabStore'
import { useVault } from '../stores/vaultStore'

interface BacklinksPanelProps {
  activePath: string | null
}

export function BacklinksPanel({ activePath }: BacklinksPanelProps) {
  const { index } = useVault()
  const [activeSubTab, setActiveSubTab] = useState<'backlinks' | 'outgoing'>('backlinks')

  const currentMeta = useMemo(() => {
    if (!activePath) return null
    return index.files.get(activePath) || null
  }, [activePath, index.files])

  const backlinks = useMemo(() => {
    if (!activePath) return []
    return index.backlinks.get(activePath) || []
  }, [activePath, index.backlinks])

  const outgoingLinks = useMemo(() => {
    if (!activePath) return []
    return index.outgoingLinks.get(activePath) || []
  }, [activePath, index.outgoingLinks])

  function handleOpenNote(targetPathOrTitle: string) {
    const resolved = index.titleToPath.get(targetPathOrTitle.toLowerCase()) || targetPathOrTitle
    tabStore.openTab(resolved)
  }

  if (!activePath) {
    return (
      <div className="sidepanel-empty">
        <Link2 size={24} className="text-slate-500 mb-2" />
        <p>Bağlantıları görmek için bir not seçin.</p>
      </div>
    )
  }

  return (
    <div className="backlinks-panel">
      {/* Sub Tabs */}
      <div className="backlinks-subtabs">
        <button
          type="button"
          className={`backlinks-subtab ${activeSubTab === 'backlinks' ? 'backlinks-subtab--active' : ''}`}
          onClick={() => setActiveSubTab('backlinks')}
        >
          <ArrowDownLeft size={13} />
          <span>Geri ({backlinks.length})</span>
        </button>
        <button
          type="button"
          className={`backlinks-subtab ${activeSubTab === 'outgoing' ? 'backlinks-subtab--active' : ''}`}
          onClick={() => setActiveSubTab('outgoing')}
        >
          <ArrowUpRight size={13} />
          <span>Giden ({outgoingLinks.length})</span>
        </button>
      </div>

      <div className="backlinks-content-scroll">
        {activeSubTab === 'backlinks' ? (
          <div>
            {backlinks.length === 0 ? (
              <div className="sidepanel-empty">Bu nota yönlendiren geri bağlantı yok.</div>
            ) : (
              <div className="backlinks-list">
                {backlinks.map((item, idx) => (
                  <div
                    key={idx}
                    className="backlink-card"
                    onClick={() => handleOpenNote(item.sourcePath)}
                  >
                    <div className="backlink-card-header">
                      <FileText size={13} className="text-sky-400" />
                      <span className="backlink-card-title">{item.sourceTitle}</span>
                    </div>
                    {item.contextSnippet && (
                      <div className="backlink-card-snippet">
                        "{item.contextSnippet}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            {outgoingLinks.length === 0 ? (
              <div className="sidepanel-empty">Bu notta giden bağlantı yok.</div>
            ) : (
              <div className="outgoing-links-list">
                {outgoingLinks.map((link, idx) => (
                  <div
                    key={idx}
                    className="outgoing-link-item"
                    onClick={() => handleOpenNote(link.targetTitle)}
                  >
                    <Link2 size={13} className="text-slate-400" />
                    <span className="outgoing-link-title">
                      {link.alias ? `${link.alias} (${link.targetTitle})` : link.targetTitle}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
