export type PageType =
  | 'about'
  | 'privacy'
  | 'imprint'
  | 'terms'
  | 'affiliate-disclosure'
  | 'contact'
  | 'other'

export type Dictionary = {
  nav: { home: string; menu: string }
  post: {
    buyNow: string
    publishedOn: string
    readMore: string
    productsHeading: string
    summaryHeading: string
  }
  pagination: { previous: string; next: string; page: string; ariaLabel: string }
  notFound: { title: string; body: string; backHome: string }
  error: { title: string; retry: string }
  footer: { disclosure: string; rights: string }
  pageTypes: Record<PageType, string>
}
