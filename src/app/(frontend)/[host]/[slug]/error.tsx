'use client'

/**
 * Next requires error boundaries to be Client Components. These two `error.tsx` files are
 * the only `'use client'` modules in the frontend tree.
 *
 * The boundary sits below the layout, so it cannot read the domain's dictionary — the copy
 * here is intentionally language-neutral rather than wrong in the domain's language.
 */
export default function HostError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <button
        type="button"
        onClick={retry}
        className="mt-6 rounded border border-current px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </main>
  )
}
