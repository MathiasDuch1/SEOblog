import type { Dictionary } from '../types'

/** Shared by every English-speaking domain (en-US, en-GB, …). Country differences are
 *  handled by `Intl` formatting with the full locale, not by separate dictionaries. */
export const en: Dictionary = {
  nav: {
    home: 'Home',
    menu: 'Menu',
  },
  post: {
    buyNow: 'Buy now',
    publishedOn: 'Published on',
    readMore: 'Read more',
    productsHeading: 'What we recommend',
    summaryHeading: 'In short',
  },
  pagination: {
    previous: 'Previous',
    next: 'Next',
    page: 'Page',
    ariaLabel: 'Pagination',
  },
  notFound: {
    title: 'Page not found',
    body: 'That page does not exist, or it has moved.',
    backHome: 'Back to the front page',
  },
  error: {
    title: 'Something went wrong',
    retry: 'Try again',
  },
  footer: {
    disclosure:
      'Some links on this site are affiliate links. If you buy through them we may earn a commission, at no extra cost to you.',
    rights: 'All rights reserved.',
  },
  pageTypes: {
    about: 'About',
    privacy: 'Privacy policy',
    imprint: 'Imprint',
    terms: 'Terms',
    'affiliate-disclosure': 'Affiliate disclosure',
    contact: 'Contact',
    other: 'More',
  },
}
