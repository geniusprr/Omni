import { useMemo } from 'react'
import Hash from 'lucide-react/dist/esm/icons/hash.js'
import ListTree from 'lucide-react/dist/esm/icons/list-tree.js'
import { useVault } from '../stores/vaultStore'

interface OutlinePanelProps {
  activePath: string | null
}

export function OutlinePanel({ activePath }: OutlinePanelProps) {
  const { index } = useVault()

  const headings = useMemo(() => {
    if (!activePath) return []
    const meta = index.files.get(activePath)
    return meta?.headings || []
  }, [activePath, index.files])

  function handleScrollToHeading(line: number) {
    window.dispatchEvent(new CustomEvent('note:scroll-to-line', { detail: { line } }))
  }

  if (!activePath) {
    return (
      <div className="sidepanel-empty">
        <ListTree size={24} className="text-slate-500 mb-2" />
        <p>İçindekileri görmek için bir not seçin.</p>
      </div>
    )
  }

  return (
    <div className="outline-panel">
      {headings.length === 0 ? (
        <div className="sidepanel-empty">Bu notta başlık bulunamadı.</div>
      ) : (
        <div className="outline-list">
          {headings.map((h, idx) => (
            <div
              key={idx}
              className={`outline-item outline-item--h${h.level}`}
              style={{ paddingLeft: `${(h.level - 1) * 12 + 10}px` }}
              onClick={() => handleScrollToHeading(h.line)}
              title={`Satır ${h.line}`}
            >
              <Hash size={12} className="outline-hash-icon" />
              <span className="outline-text">{h.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
