import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

export const kapanisEditorTheme = EditorView.theme({
  '&': {
    color: 'var(--notes-ink)',
    backgroundColor: 'var(--notes-editor-surface)',
    fontSize: '0.9375rem',
    fontFamily: 'var(--font-body)',
    height: '100%',
    lineHeight: '1.75',
  },
  '.cm-content': {
    padding: '2.25rem clamp(1.25rem, 7vw, 6rem) 12rem',
    caretColor: 'var(--notes-accent)',
    fontFamily: 'inherit',
    maxWidth: '58rem',
    margin: '0 auto',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--notes-accent)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--notes-editor-selection) !important',
  },
  '.cm-panels': {
    backgroundColor: 'var(--notes-surface-raised)',
    color: 'var(--notes-ink)',
    borderBottom: '1px solid var(--notes-rule)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--notes-editor-match)',
    outline: '1px solid var(--notes-accent)',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--notes-accent-soft)',
    outline: '1px solid var(--notes-accent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--notes-editor-active-line)',
  },
  '.cm-selectionMatch': {
    backgroundColor: 'var(--notes-accent-soft)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--notes-editor-surface)',
    color: 'var(--notes-faint)',
    border: 'none',
    paddingRight: '1rem',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
  },
  '.cm-activeLineGutter': {
    color: 'var(--notes-ink)',
    backgroundColor: 'var(--notes-editor-surface)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--notes-surface-hover)',
    border: '1px solid var(--notes-rule)',
    color: 'var(--notes-muted)',
    borderRadius: 'var(--radius-small)',
    padding: '0 5px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--notes-popup)',
    border: '1px solid var(--notes-rule-strong)',
    backdropFilter: 'blur(16px)',
    borderRadius: 'var(--radius-control)',
    boxShadow: 'var(--notes-shadow)',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      maxHeight: '260px',
      fontFamily: 'var(--font-body)',
      fontSize: '0.8125rem',
    },
    '& > ul > li': {
      padding: '6px 12px',
      color: 'var(--notes-ink-soft)',
      borderRadius: 'var(--radius-small)',
      margin: '2px 4px',
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'var(--notes-accent-soft)',
      color: 'var(--notes-ink)',
      boxShadow: 'inset 0 1px 0 var(--notes-rule-strong)',
    },
  },
})

export const kapanisHighlightStyle = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading1, fontSize: '1.875rem', fontWeight: '700', color: 'var(--notes-ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.03em', lineHeight: '1.2' },
    { tag: t.heading2, fontSize: '1.45rem', fontWeight: '700', color: 'var(--notes-ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.025em', lineHeight: '1.3' },
    { tag: t.heading3, fontSize: '1.2rem', fontWeight: '600', color: 'var(--notes-ink-soft)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
    { tag: t.heading4, fontSize: '1.05rem', fontWeight: '600', color: 'var(--notes-ink-soft)' },
    { tag: t.heading5, fontSize: '0.95rem', fontWeight: '600', color: 'var(--notes-muted)' },
    { tag: t.heading6, fontSize: '0.875rem', fontWeight: '600', color: 'var(--notes-muted)' },
    { tag: t.strong, fontWeight: '700', color: 'var(--notes-ink)' },
    { tag: t.emphasis, fontStyle: 'italic', color: 'var(--notes-ink-soft)' },
    { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--notes-faint)' },
    { tag: t.keyword, color: 'var(--notes-accent)' },
    { tag: t.atom, color: 'var(--notes-syntax-atom)' },
    { tag: t.number, color: 'var(--notes-syntax-number)' },
    { tag: t.definition(t.name), color: 'var(--notes-accent)' },
    { tag: t.variableName, color: 'var(--notes-ink-soft)' },
    { tag: t.function(t.variableName), color: 'var(--notes-ink)' },
    { tag: t.string, color: 'var(--notes-success)' },
    { tag: t.comment, color: 'var(--notes-faint)', fontStyle: 'italic' },
    { tag: t.meta, color: 'var(--notes-muted)' },
    { tag: t.monospace, fontFamily: 'var(--font-mono)', backgroundColor: 'var(--notes-surface-hover)', borderRadius: 'var(--radius-small)', padding: '1px 5px', color: 'var(--notes-ink-soft)' },
    { tag: t.link, color: 'var(--notes-accent)', textDecoration: 'none', borderBottom: '1px dotted var(--notes-accent)' },
    { tag: t.url, color: 'var(--notes-accent)' },
  ]),
)
