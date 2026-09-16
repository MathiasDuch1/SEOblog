import type { Metadata } from 'next'

import './(frontend)/[host]/globals.css'

export const metadata: Metadata = {
  title: '404 — Page not found',
  description: 'The page you are looking for does not exist.',
}

/**
 * 404 for URLs that match no route at all. Next skips rendering the layout tree here, so
 * this file owns its own `<html>` and stays deliberately unbranded — it can be reached on
 * any hostname, including ones we do not serve.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">404 — Page not found</h1>
        <p className="text-sm opacity-70">This page does not exist.</p>
      </body>
    </html>
  )
}
