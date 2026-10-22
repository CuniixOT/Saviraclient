import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo } from 'react';
import { profilesApi } from './api';

// Project descriptions are Markdown with HTML from strangers: rendered, then cleaned of scripts,
// frames, styles and event handlers. Links open in the normal browser.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A') { node.setAttribute('rel', 'noreferrer'); node.removeAttribute('target'); }
  if (node.tagName === 'IMG') { node.setAttribute('loading', 'lazy'); node.setAttribute('referrerpolicy', 'no-referrer'); }
});

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: false }) as string, {
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'object', 'embed'],
    FORBID_ATTR: ['style'],
    ALLOWED_URI_REGEXP: /^(?:https:|#)/i,
  }), [source]);
  function onClick(event: React.MouseEvent) {
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') || '';
    if (href.startsWith('https://')) void profilesApi.openLink(href);
  }
  return <div className="markdown" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
