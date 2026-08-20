import React from 'react'

interface ReadingModeProps {
  content: string
  onNavigate: (targetTitle: string) => void
}

export function ReadingMode({ content, onNavigate }: ReadingModeProps) {
  const lines = content.split(/\r?\n/)

  // Remove YAML frontmatter from display
  let bodyLines = lines
  if (lines.length > 0 && lines[0].trim() === '---') {
    const endIdx = lines.slice(1).findIndex((l) => l.trim() === '---')
    if (endIdx !== -1) {
      bodyLines = lines.slice(endIdx + 2)
    }
  }

  function renderInline(text: string): React.ReactNode[] {
    const nodes: React.ReactNode[] = []
    let cursor = 0

    // Match wikilinks [[Target|Alias]] or tags #tag or bold **...** or italic *...* or code `...`
    const regex = /(\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\])|((?:^|\s)#[a-zA-Z0-9_\u00C0-\u017F\u0180-\u024F\u0400-\u04FF-]+)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      if (match.index > cursor) {
        nodes.push(text.substring(cursor, match.index))
      }

      if (match[1]) {
        // Wikilink
        const target = match[2]?.trim() || ''
        const alias = match[4]?.trim() || target
        nodes.push(
          <button
            key={match.index}
            type="button"
            className="reading-wikilink"
            onClick={() => onNavigate(target)}
            title={`Notu Aç: ${target}`}
          >
            {alias}
          </button>,
        )
      } else if (match[5]) {
        // Tag
        const tag = match[5].trim()
        nodes.push(
          <span key={match.index} className="reading-tag">
            {tag}
          </span>,
        )
      } else if (match[6]) {
        // Bold
        nodes.push(<strong key={match.index}>{match[7]}</strong>)
      } else if (match[8]) {
        // Italic
        nodes.push(<em key={match.index}>{match[9]}</em>)
      } else if (match[10]) {
        // Inline Code
        nodes.push(<code key={match.index} className="reading-inline-code">{match[11]}</code>)
      }

      cursor = match.index + match[0].length
    }

    if (cursor < text.length) {
      nodes.push(text.substring(cursor))
    }

    return nodes
  }

  let inCodeBlock = false
  let codeBlockLines: string[] = []

  const elements: React.ReactNode[] = []

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // Close code block
        elements.push(
          <pre key={`code_${i}`} className="reading-code-block">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>,
        )
        codeBlockLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      continue
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      elements.push(<hr key={i} className="reading-hr" />)
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      elements.push(
        <Tag key={i} className={`reading-h${level}`}>
          {renderInline(text)}
        </Tag>,
      )
      continue
    }

    // Task list
    const taskMatch = line.match(/^(\s*[-*]\s+)\[([ xX])\]\s+(.+)$/)
    if (taskMatch) {
      const isChecked = taskMatch[2].toLowerCase() === 'x'
      elements.push(
        <div key={i} className="reading-task-item">
          <input type="checkbox" checked={isChecked} readOnly className="reading-checkbox" />
          <span>{renderInline(taskMatch[3])}</span>
        </div>,
      )
      continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      elements.push(
        <blockquote key={i} className="reading-blockquote">
          {renderInline(line.replace(/^>\s?/, ''))}
        </blockquote>,
      )
      continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={i} className="reading-blank-line" />)
      continue
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="reading-p">
        {renderInline(line)}
      </p>,
    )
  }

  return (
    <div className="reading-mode-container">
      <article className="reading-mode-article" aria-label="Not okuma görünümü">
        <div className="reading-document-body">{elements}</div>
      </article>
    </div>
  )
}
