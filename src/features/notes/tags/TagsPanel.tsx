import { useMemo } from 'react'
import Tag from 'lucide-react/dist/esm/icons/tag.js'
import { tabStore } from '../stores/tabStore'
import { useVault } from '../stores/vaultStore'

interface TagsPanelProps {
  onSelectTag?: (tag: string) => void
}

export function TagsPanel({ onSelectTag }: TagsPanelProps) {
  const { index } = useVault()

  const tagList = useMemo(() => {
    const list: { tag: string; count: number; paths: string[] }[] = []

    for (const [tag, pathSet] of index.tags.entries()) {
      list.push({
        tag,
        count: pathSet.size,
        paths: Array.from(pathSet),
      })
    }

    return list.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  }, [index.tags])

  function handleTagClick(tagItem: { tag: string; paths: string[] }) {
    if (onSelectTag) {
      onSelectTag(tagItem.tag)
    } else if (tagItem.paths.length > 0) {
      tabStore.openTab(tagItem.paths[0])
    }
  }

  return (
    <div className="tags-panel">
      {tagList.length === 0 ? (
        <div className="sidepanel-empty">
          <Tag size={24} className="text-slate-500 mb-2" />
          <p>Vault içinde etiket (#etiket) bulunamadı.</p>
        </div>
      ) : (
        <div className="tags-list">
          {tagList.map((item) => (
            <div
              key={item.tag}
              className="tag-row-item"
              onClick={() => handleTagClick(item)}
              title={`${item.count} notta kullanılıyor`}
            >
              <div className="tag-row-label">
                <Tag size={12} className="text-sky-400" />
                <span className="tag-row-name">#{item.tag}</span>
              </div>
              <span className="tag-row-count">{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
