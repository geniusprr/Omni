import { useEffect, useRef, useState } from 'react'
import * as d3Force from 'd3-force'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Search from 'lucide-react/dist/esm/icons/search.js'
import ZoomIn from 'lucide-react/dist/esm/icons/zoom-in.js'
import ZoomOut from 'lucide-react/dist/esm/icons/zoom-out.js'
import { tabStore } from '../stores/tabStore'
import { useVault } from '../stores/vaultStore'
import type { GraphLink, GraphNode } from '../types'

interface GraphViewProps {
  isLocal?: boolean
  localPath?: string
}

export function GraphView({ isLocal = false, localPath }: GraphViewProps) {
  const { index } = useVault()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  // Simulation state
  const simulationRef = useRef<d3Force.Simulation<GraphNode, GraphLink> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const linksRef = useRef<GraphLink[]>([])

  // Camera transform (Pan & Zoom)
  const transformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })
  const isDraggingCanvasRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const draggedNodeRef = useRef<GraphNode | null>(null)

  // 1. Build Graph Nodes and Links from VaultIndex
  useEffect(() => {
    const rawNodes: GraphNode[] = []
    const rawLinks: GraphLink[] = []
    const degreeMap = new Map<string, number>()

    // Determine relevant files
    let targetPaths = Array.from(index.files.keys())

    if (isLocal && localPath) {
      const neighborSet = new Set<string>([localPath])
      const outgoing = index.outgoingLinks.get(localPath) || []
      for (const out of outgoing) {
        const resolved = index.titleToPath.get(out.targetTitle.toLowerCase())
        if (resolved) neighborSet.add(resolved)
      }
      const backlinks = index.backlinks.get(localPath) || []
      for (const b of backlinks) {
        neighborSet.add(b.sourcePath)
      }
      targetPaths = Array.from(neighborSet)
    }

    // Build degree map
    for (const [sourcePath, links] of index.outgoingLinks.entries()) {
      if (!targetPaths.includes(sourcePath)) continue
      for (const link of links) {
        const targetPath = index.titleToPath.get(link.targetTitle.toLowerCase())
        if (targetPath && targetPaths.includes(targetPath) && sourcePath !== targetPath) {
          rawLinks.push({ source: sourcePath, target: targetPath })
          degreeMap.set(sourcePath, (degreeMap.get(sourcePath) || 0) + 1)
          degreeMap.set(targetPath, (degreeMap.get(targetPath) || 0) + 1)
        }
      }
    }

    for (const path of targetPaths) {
      const meta = index.files.get(path)
      const title = meta?.title || path.split('/').pop()?.replace(/\.md$/i, '') || path
      const degree = degreeMap.get(path) || 0

      if (filterQuery && !title.toLowerCase().includes(filterQuery.toLowerCase())) {
        continue
      }

      rawNodes.push({
        id: path,
        title,
        degree,
      })
    }

    nodesRef.current = rawNodes
    linksRef.current = rawLinks

    // Setup D3 Force Simulation
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.clientWidth || 800
    const height = canvas.clientHeight || 600

    transformRef.current = { x: width / 2, y: height / 2, k: 1 }

    const sim = d3Force
      .forceSimulation<GraphNode, GraphLink>(rawNodes)
      .force(
        'link',
        d3Force
          .forceLink<GraphNode, GraphLink>(rawLinks)
          .id((d) => d.id)
          .distance(70),
      )
      .force('charge', d3Force.forceManyBody().strength(-160))
      .force('center', d3Force.forceCenter(0, 0))
      .force('collision', d3Force.forceCollide().radius((d: any) => 12 + d.degree * 2))

    simulationRef.current = sim

    sim.on('tick', () => {
      renderCanvas()
    })

    return () => {
      sim.stop()
    }
  }, [index, isLocal, localPath, filterQuery])

  // 2. Canvas Renderer
  function renderCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const { x, y, k } = transformRef.current
    const hovered = hoveredNode

    ctx.clearRect(0, 0, width, height)

    ctx.save()
    ctx.translate(x, y)
    ctx.scale(k, k)

    // Draw Links
    for (const link of linksRef.current) {
      const source = link.source as GraphNode
      const target = link.target as GraphNode

      if (typeof source.x !== 'number' || typeof target.x !== 'number') continue

      const isConnectedToHovered =
        hovered && (source.id === hovered.id || target.id === hovered.id)

      ctx.beginPath()
      ctx.moveTo(source.x, source.y!)
      ctx.lineTo(target.x, target.y!)
      ctx.strokeStyle = isConnectedToHovered
        ? 'rgba(56, 189, 248, 0.7)'
        : 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = isConnectedToHovered ? 1.8 : 0.9
      ctx.stroke()
    }

    // Draw Nodes
    for (const node of nodesRef.current) {
      if (typeof node.x !== 'number' || typeof node.y !== 'number') continue

      const isHovered = hovered?.id === node.id
      const isNeighbor =
        hovered &&
        linksRef.current.some(
          (l) =>
            ((l.source as GraphNode).id === hovered.id && (l.target as GraphNode).id === node.id) ||
            ((l.target as GraphNode).id === hovered.id && (l.source as GraphNode).id === node.id),
        )

      const baseRadius = Math.min(14, Math.max(4.5, 4.5 + node.degree * 1.5))
      const radius = isHovered ? baseRadius * 1.3 : baseRadius

      // Node circle
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI)

      if (isHovered || node.id === localPath) {
        ctx.fillStyle = '#38bdf8'
        ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'
        ctx.shadowBlur = 10
      } else if (isNeighbor) {
        ctx.fillStyle = '#7dd3fc'
        ctx.shadowColor = 'rgba(125, 211, 252, 0.5)'
        ctx.shadowBlur = 6
      } else {
        ctx.fillStyle = node.degree > 0 ? '#94a3b8' : '#475569'
        ctx.shadowBlur = 0
      }

      ctx.fill()
      ctx.shadowBlur = 0

      // Node label
      if (k > 0.65 || isHovered || isNeighbor || node.degree > 2 || isLocal) {
        ctx.font = `${isHovered ? '600 12px' : '400 11px'} Geist, sans-serif`
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(226, 232, 240, 0.85)'
        ctx.textAlign = 'center'
        ctx.fillText(node.title, node.x, node.y + radius + 13)
      }
    }

    ctx.restore()
  }

  // Handle Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = canvas.parentElement?.clientWidth || 800
        canvas.height = canvas.parentElement?.clientHeight || 600
        renderCanvas()
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Mouse / Touch handlers for Pan, Zoom, and Dragging
  function getNodeAtCoords(clientX: number, clientY: number): GraphNode | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top

    const { x, y, k } = transformRef.current
    const graphX = (mouseX - x) / k
    const graphY = (mouseY - y) / k

    for (const node of nodesRef.current) {
      if (typeof node.x !== 'number' || typeof node.y !== 'number') continue
      const radius = 6 + node.degree * 1.5
      const dx = graphX - node.x
      const dy = graphY - node.y
      if (dx * dx + dy * dy <= radius * radius + 10) {
        return node
      }
    }

    return null
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const node = getNodeAtCoords(e.clientX, e.clientY)
    if (node) {
      draggedNodeRef.current = node
      node.vx = 0
      node.vy = 0
      simulationRef.current?.alphaTarget(0.3).restart()
    } else {
      isDraggingCanvasRef.current = true
      dragStartRef.current = { x: e.clientX, y: e.clientY }
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (draggedNodeRef.current) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const { x, y, k } = transformRef.current
      const graphX = (e.clientX - rect.left - x) / k
      const graphY = (e.clientY - rect.top - y) / k
      draggedNodeRef.current.x = graphX
      draggedNodeRef.current.y = graphY
      renderCanvas()
      return
    }

    if (isDraggingCanvasRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      transformRef.current.x += dx
      transformRef.current.y += dy
      renderCanvas()
      return
    }

    // Check hover
    const node = getNodeAtCoords(e.clientX, e.clientY)
    if (node !== hoveredNode) {
      setHoveredNode(node)
      renderCanvas()
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (draggedNodeRef.current) {
      draggedNodeRef.current = null
      simulationRef.current?.alphaTarget(0)
    }
    isDraggingCanvasRef.current = false
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const node = getNodeAtCoords(e.clientX, e.clientY)
    if (node) {
      tabStore.openTab(node.id)
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89
    const nextK = Math.min(3.5, Math.max(0.2, transformRef.current.k * zoomFactor))

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    transformRef.current.x = mouseX - ((mouseX - transformRef.current.x) / transformRef.current.k) * nextK
    transformRef.current.y = mouseY - ((mouseY - transformRef.current.y) / transformRef.current.k) * nextK
    transformRef.current.k = nextK

    renderCanvas()
  }

  function resetZoom() {
    const canvas = canvasRef.current
    if (!canvas) return
    transformRef.current = { x: canvas.width / 2, y: canvas.height / 2, k: 1 }
    simulationRef.current?.alpha(0.3).restart()
    renderCanvas()
  }

  return (
    <div className={`graph-container ${isLocal ? 'graph-container--local' : ''}`}>
      {/* Graph Toolbar */}
      <div className="graph-toolbar">
        <div className="graph-search">
          <Search size={13} className="graph-search-icon" />
          <input
            type="text"
            placeholder="Düğümlerde ara..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="graph-search-input"
          />
        </div>

        <div className="graph-controls">
          <button
            type="button"
            className="graph-ctrl-btn"
            title="Yakınlaştır"
            onClick={() => {
              transformRef.current.k = Math.min(3.5, transformRef.current.k * 1.2)
              renderCanvas()
            }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="graph-ctrl-btn"
            title="Uzaklaştır"
            onClick={() => {
              transformRef.current.k = Math.max(0.2, transformRef.current.k * 0.8)
              renderCanvas()
            }}
          >
            <ZoomOut size={14} />
          </button>
          <button type="button" className="graph-ctrl-btn" title="Merkeze Sıfırla" onClick={resetZoom}>
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            className="graph-ctrl-btn"
            title="Yeniden Simüle Et"
            onClick={() => simulationRef.current?.alpha(0.5).restart()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Node detail tooltip badge */}
      {hoveredNode && (
        <div className="graph-tooltip-badge">
          <span>{hoveredNode.title}</span>
          <span style={{ color: 'var(--k-muted)', fontSize: '0.6875rem' }}>({hoveredNode.degree} bağlantı)</span>
        </div>
      )}
    </div>
  )
}
