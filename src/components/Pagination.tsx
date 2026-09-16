import Link from 'next/link'

import type { Dictionary } from '@/lib/i18n'

export function Pagination({
  page,
  totalPages,
  dictionary,
}: {
  page: number
  totalPages: number
  dictionary: Dictionary
}) {
  if (totalPages <= 1) return null

  const href = (target: number) => (target === 1 ? '/' : `/?page=${target}`)

  return (
    <nav aria-label={dictionary.pagination.ariaLabel} className="mt-12 flex items-center justify-between">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className="text-sm font-medium text-primary">
          ← {dictionary.pagination.previous}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-foreground/60">
        {dictionary.pagination.page} {page}/{totalPages}
      </span>
      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" className="text-sm font-medium text-primary">
          {dictionary.pagination.next} →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
