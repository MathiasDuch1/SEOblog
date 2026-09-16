import type { JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'

/**
 * Any link in a body that leaves this domain is treated as a commercial link: `sponsored
 * nofollow noopener` and a new tab. Links that stay on the domain are left alone.
 */
function isOffSite(url: string, hostname: string): boolean {
  if (!url || url.startsWith('/') || url.startsWith('#')) return false
  try {
    return new URL(url).hostname.toLowerCase() !== hostname.toLowerCase()
  } catch {
    return false
  }
}

export const buildConverters =
  (hostname: string): JSXConvertersFunction =>
  ({ defaultConverters }) => ({
    ...defaultConverters,
    autolink: ({ node, nodesToJSX }) => {
      const url: string = node.fields.url ?? ''
      const offSite = isOffSite(url, hostname)
      return (
        <a
          href={url}
          rel={offSite ? 'sponsored nofollow noopener' : undefined}
          target={offSite ? '_blank' : undefined}
        >
          {nodesToJSX({ nodes: node.children })}
        </a>
      )
    },
    link: ({ node, nodesToJSX }) => {
      const url: string = node.fields.url ?? ''
      const offSite = isOffSite(url, hostname)
      return (
        <a
          href={url}
          rel={offSite ? 'sponsored nofollow noopener' : undefined}
          target={offSite ? '_blank' : undefined}
        >
          {nodesToJSX({ nodes: node.children })}
        </a>
      )
    },
  })
