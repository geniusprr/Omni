import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const kapanisEditorTheme = EditorView.theme({
  '&': {
    color: 'var(--k-ink)',
    backgroundColor: 'transparent',
    fontSize: '0.9375rem',
    fontFamily: 'var(--font-body)',
    height: '100%',
    lineHeight: '1.75',
  },
  '.cm-content': {
    padding: '1.75rem 2.5rem 10rem 2.5rem',
    caretColor: 'var(--k-accent)',
    fontFamily: 'inherit',
    maxWidth: '100%',
    margin: '0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--k-accent)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(255, 255, 255, 0.12) !important',
  },
  '.cm-panels': {
    backgroundColor: 'var(--k-paper-raised)',
    color: 'var(--k-ink)',
    borderBottom: '1px solid var(--k-rule)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(250, 204, 21, 0.25)',
    outline: '1px solid rgba(250, 204, 21, 0.5)',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(56, 189, 248, 0.35)',
    outline: '1px solid var(--k-accent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--k-faint)',
    border: 'none',
    paddingRight: '1rem',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
  },
  '.cm-activeLineGutter': {
    color: 'var(--k-ink)',
    backgroundColor: 'transparent',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid var(--k-rule)',
    color: 'var(--k-muted)',
    borderRadius: 'var(--radius-small)',
    padding: '0 5px',
  },
  '.cm-tooltip': {
    backgroundColor: 'rgba(18, 24, 35, 0.95)',
    border: '1px solid var(--k-rule-strong)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-control)',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      maxHeight: '260px',
      fontFamily: 'var(--font-body)',
      fontSize: '0.8125rem',
    },
    '& > ul > li': {
      padding: '6px 12px',
      color: 'var(--k-ink-soft)',
      borderRadius: 'var(--radius-small)',
      margin: '2px 4px',
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      color: 'var(--k-ink)',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
    },
  },
})

export const kapanisHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading1, fontSize: '1.875rem', fontWeight: '700', color: 'var(--k-ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: '1.2' },
    { tag: t.heading2, fontSize: '1.45rem', fontWeight: '700', color: 'var(--k-ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.025em', lineHeight: '1.3' },
    { tag: t.heading3, fontSize: '1.2rem', fontWeight: '600', color: 'var(--k-ink-soft)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
    { tag: t.heading4, fontSize: '1.05rem', fontWeight: '600', color: 'var(--k-ink-soft)' },
    { tag: t.heading5, fontSize: '0.95rem', fontWeight: '600', color: 'var(--k-muted)' },
    { tag: t.heading6, fontSize: '0.875rem', fontWeight: '600', color: 'var(--k-muted)' },
    { tag: t.strong, fontWeight: '700', color: 'var(--k-ink)' },
    { tag: t.emphasis, fontStyle: 'italic', color: 'var(--k-ink-soft)' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--k-faint)' },
    { tag: t.keyword, color: 'var(--k-accent)' },
    { tag: t.atom, color: '#f472b6' },
    { tag: t.number, color: '#fb923c' },
    { tag: t.definition(t.name), color: 'var(--k-accent)' },
    { tag: t.variableName, color: 'var(--k-ink-soft)' },
    { tag: t.function(t.variableName), color: 'var(--k-ink)' },
    { tag: t.string, color: 'var(--k-success)' },
    { tag: t.comment, color: 'var(--k-faint)', fontStyle: 'italic' },
    { tag: t.meta, color: 'var(--k-muted)' },
    { tag: t.monospace, fontFamily: 'var(--font-mono)', backgroundColor: 'rgba(255, 255, 255, 0.06)', borderRadius: 'var(--radius-small)', padding: '1px 5px', color: 'var(--k-ink-soft)' },
    { tag: t.link, color: 'var(--k-accent)', textDecoration: 'none', borderBottom: '1px dotted var(--k-accent)' },
    { tag: t.url, color: 'var(--k-accent)' },
  ]),
)
