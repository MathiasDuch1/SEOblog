/**
 * Idempotent development seed: two niches, three dev domains, and content in each
 * domain's own language. Safe to run repeatedly — every document is looked up first
 * and updated in place, so counts never grow.
 *
 * Run with `npm run seed`.
 *
 * Gamma is a local-only fixture (see the decision table in docs/build-guide/00-overview.md):
 * it shares Alpha's language but sits in a second niche, so niche grouping and
 * same-language domain isolation stay verifiable with only two launch locales.
 */
import { randomUUID } from 'crypto'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import config from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import sharp from 'sharp'

type Template = 'listicle' | 'informational'
type Status = 'draft' | 'scheduled' | 'published'

type SeedProduct = {
  title: string
  description: string
  affiliateUrl: string
}

type SeedPost = {
  slug: string
  title: string
  template: Template
  status: Status
  intro: string
  summary: string
  /** Days before now for published posts; days after now for scheduled ones. */
  offsetDays: number
  color: string
  products?: SeedProduct[]
  markdown?: string
}

type SeedPage = {
  slug: string
  title: string
  type: 'about' | 'privacy' | 'imprint' | 'affiliate-disclosure'
  markdown: string
}

type SeedDomain = {
  name: string
  hostname: string
  locale: string
  /** Alpha and Gamma share a country and locale; different US timezones keep their calendars apart. */
  timezone: string
  nicheSlug: string
  primaryColor: string
  accentColor: string
  affiliate: { source: string; marketplace: string; partnerTag: string }
  dataforseo: { locationCode: number; languageCode: string }
  posts: SeedPost[]
  pages: SeedPage[]
}

// ---------------------------------------------------------------- content

const enBody = (topic: string, link: string, linkText: string) => `
## What to look for in ${topic}

Quality matters more than price here. A well-made piece supports a daily practice for
years, while a cheap one flattens, frays, or cracks within months. Start by deciding how
often you will use it and where you will store it.

## How we tested

We looked at materials, construction, and how each option held up over a month of daily
use. Nothing was rushed, and nothing was judged on looks alone.

### Materials

Natural fibres breathe better and age more gracefully than synthetic blends, though they
usually cost more up front. If you sit for longer sessions, the difference is easy to feel.

### Size and weight

Think about whether this stays in one room or travels with you. [${linkText}](${link})
covers the range we recommend most often.

## Common mistakes

The most frequent error is buying for the practice you imagine rather than the one you
actually have. Begin with what you will use this week.
`.trim()

const daBody = (topic: string, link: string, linkText: string) => `
## Hvad du skal kigge efter i ${topic}

Kvalitet betyder mere end pris her. Et velfremstillet stykke understøtter en daglig praksis
i årevis, mens et billigt fladdes ud, trævler eller revner inden for få måneder. Start med at
beslutte, hvor ofte du vil bruge det, og hvor du opbevarer det.

## Sådan testede vi

Vi kiggede på materialer, forarbejdning og hvordan hver mulighed holdt til en måneds daglig
brug. Intet blev forhastet, og intet blev bedømt på udseendet alene.

### Materialer

Naturfibre ånder bedre og ældes smukkere end syntetiske blandinger, selvom de typisk koster
mere fra start. Sidder du i længere sessioner, kan du mærke forskellen med det samme.

### Størrelse og vægt

Overvej, om det bliver stående i ét rum, eller om det skal med på rejsen. [${linkText}](${link})
dækker det udvalg, vi oftest anbefaler.

## Typiske fejl

Den hyppigste fejl er at købe til den praksis, man forestiller sig, frem for den man faktisk
har. Begynd med det, du rent faktisk bruger i denne uge.
`.trim()

const PLACEHOLDER_EN = '**Placeholder — replace before launch.**'
const PLACEHOLDER_DA = '**Pladsholder — skal erstattes inden lancering.**'

const enPages = (siteName: string): SeedPage[] => [
  {
    slug: 'about',
    title: 'About',
    type: 'about',
    markdown: `${PLACEHOLDER_EN}\n\n${siteName} publishes buying guides and practical articles. This page will describe who is behind the site and how it is funded.`,
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    type: 'privacy',
    markdown: `${PLACEHOLDER_EN}\n\nThis page will set out what data ${siteName} collects, the legal basis for processing it, how long it is kept, and how to exercise your rights.`,
  },
  {
    slug: 'imprint',
    title: 'Imprint',
    type: 'imprint',
    markdown: `${PLACEHOLDER_EN}\n\nThis page will carry the operator's name, postal address, contact details, and company registration.`,
  },
  {
    slug: 'affiliate-disclosure',
    title: 'Affiliate disclosure',
    type: 'affiliate-disclosure',
    markdown: `${PLACEHOLDER_EN}\n\n${siteName} earns commission on purchases made through some links. The final wording must match the affiliate network's operating agreement.`,
  },
]

const daPages = (siteName: string): SeedPage[] => [
  {
    slug: 'om-os',
    title: 'Om os',
    type: 'about',
    markdown: `${PLACEHOLDER_DA}\n\n${siteName} udgiver købsguides og praktiske artikler. Denne side skal beskrive, hvem der står bag sitet, og hvordan det finansieres.`,
  },
  {
    slug: 'privatlivspolitik',
    title: 'Privatlivspolitik',
    type: 'privacy',
    markdown: `${PLACEHOLDER_DA}\n\nDenne side skal beskrive, hvilke data ${siteName} indsamler, retsgrundlaget for behandlingen, hvor længe data gemmes, og hvordan du gør dine rettigheder gældende.`,
  },
  {
    slug: 'kolofon',
    title: 'Kolofon',
    type: 'imprint',
    markdown: `${PLACEHOLDER_DA}\n\nDenne side skal indeholde udgiverens navn, postadresse, kontaktoplysninger og CVR-nummer.`,
  },
  {
    slug: 'affiliate-oplysning',
    title: 'Affiliate-oplysning',
    type: 'affiliate-disclosure',
    markdown: `${PLACEHOLDER_DA}\n\n${siteName} tjener kommission på køb foretaget via visse links. Den endelige formulering skal matche affiliate-netværkets betingelser.`,
  },
]

const alphaPosts: SeedPost[] = [
  {
    slug: 'best-meditation-cushions',
    title: 'The 4 Best Meditation Cushions for a Daily Sitting Practice',
    template: 'listicle',
    status: 'published',
    offsetDays: 2,
    color: '#4c1d95',
    intro:
      'A cushion that fits your body is the difference between sitting for twenty minutes and giving up after five. These four hold their shape and keep your hips above your knees.',
    summary:
      'For most people a buckwheat zafu is the right first cushion. Upgrade to a kapok fill only once you know how long you actually sit.',
    products: [
      {
        title: 'Buckwheat Hull Zafu',
        description:
          'Firm, adjustable, and heavy enough to stay put. The hulls shift to your shape and can be removed to lower the seat.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MEDZAFU?tag=alpha-20',
      },
      {
        title: 'Kapok Round Cushion',
        description:
          'Softer than buckwheat and much lighter, which makes it the better pick if the cushion travels between rooms.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MEDKAPO?tag=alpha-20',
      },
      {
        title: 'Crescent Tilt Cushion',
        description:
          'The cut-out front lets your knees drop toward the floor, which helps if tight hips make a round cushion uncomfortable.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MEDCRES?tag=alpha-20',
      },
      {
        title: 'Zabuton Floor Mat',
        description:
          'Not a cushion on its own — a padded base that keeps ankles and knees off a hard floor. Pair it with any of the above.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MEDZABU?tag=alpha-20',
      },
    ],
  },
  {
    slug: 'best-singing-bowls',
    title: '5 Singing Bowls Worth Owning, Tested by Tone',
    template: 'listicle',
    status: 'published',
    offsetDays: 6,
    color: '#6d28d9',
    intro:
      'Most singing bowls sold online are stamped, not hammered, and it shows the moment you strike one. These five sustain a clean note.',
    summary:
      'Hand-hammered bowls cost more and sound better. If you are buying one bowl, buy the largest you can afford.',
    products: [
      {
        title: 'Hand-Hammered Himalayan Bowl, 6"',
        description:
          'A long, even sustain with almost no wobble. The visible hammer marks are the point, not a flaw.',
        affiliateUrl: 'https://www.amazon.com/dp/B000BOWLHIM?tag=alpha-20',
      },
      {
        title: 'Crystal Quartz Bowl, F Note',
        description:
          'Louder and purer than metal, and far more fragile. Best for a room where it can stay put.',
        affiliateUrl: 'https://www.amazon.com/dp/B000BOWLQTZ?tag=alpha-20',
      },
      {
        title: 'Travel Bowl with Case',
        description:
          'Small enough for a backpack. The tone is thinner than a full-size bowl, which is the trade you make for portability.',
        affiliateUrl: 'https://www.amazon.com/dp/B000BOWLTRV?tag=alpha-20',
      },
      {
        title: 'Leather-Wrapped Striker Set',
        description:
          'A soft striker for sustained tones and a hard one for a clear initial strike. Most bowls ship with only one.',
        affiliateUrl: 'https://www.amazon.com/dp/B000BOWLSTR?tag=alpha-20',
      },
    ],
  },
  {
    slug: 'best-incense-for-meditation',
    title: '3 Incense Blends That Do Not Overpower a Small Room',
    template: 'listicle',
    status: 'published',
    offsetDays: 11,
    color: '#7c3aed',
    intro:
      'Incense should mark the start of a session, not fill the apartment for a day. These three burn clean and fade on time.',
    summary:
      'Japanese-style sticks are the safest choice indoors. Resin needs ventilation and attention that most daily practices do not allow.',
    products: [
      {
        title: 'Japanese Sandalwood Sticks',
        description:
          'Low smoke, roughly twenty-five minutes per stick, and no bamboo core to add a burnt edge to the scent.',
        affiliateUrl: 'https://www.amazon.com/dp/B000INCSAND?tag=alpha-20',
      },
      {
        title: 'Palo Santo Sticks',
        description:
          'Sweet and resinous. Buy only from sellers who name their sourcing — the tree is under real pressure.',
        affiliateUrl: 'https://www.amazon.com/dp/B000INCPALO?tag=alpha-20',
      },
      {
        title: 'Frankincense Resin with Burner',
        description:
          'The strongest option here and the most work. You need charcoal, a heatproof dish, and an open window.',
        affiliateUrl: 'https://www.amazon.com/dp/B000INCFRAN?tag=alpha-20',
      },
    ],
  },
  {
    slug: 'how-to-start-a-meditation-practice',
    title: 'How to Start a Meditation Practice That Survives the First Month',
    template: 'informational',
    status: 'published',
    offsetDays: 4,
    color: '#5b21b6',
    intro:
      'Almost everyone who quits meditating quits in the first three weeks. The fix is not discipline — it is a smaller starting commitment.',
    summary:
      'Five minutes at the same time every day beats thirty minutes whenever you can manage it. Build the slot first and lengthen it later.',
    markdown: enBody(
      'a starter meditation setup',
      'https://www.amazon.com/dp/B000MEDZAFU?tag=alpha-20',
      'This buckwheat zafu',
    ),
  },
  {
    slug: 'meditation-posture-guide',
    title: 'Sitting Posture for Meditation: A Practical Guide',
    template: 'informational',
    status: 'published',
    offsetDays: 9,
    color: '#4338ca',
    intro:
      'Back pain during meditation is nearly always a hip height problem, not a willpower problem. Here is how to set your seat.',
    summary:
      'Get your hips above your knees, let the spine stack itself, and stop trying to hold a posture your body cannot yet reach.',
    markdown: enBody(
      'a meditation seat',
      'https://www.amazon.com/dp/B000MEDCRES?tag=alpha-20',
      'A crescent tilt cushion',
    ),
  },
  {
    slug: 'evening-wind-down-ritual',
    title: 'An Evening Wind-Down Ritual You Can Actually Keep',
    template: 'informational',
    status: 'published',
    offsetDays: 14,
    color: '#1d4ed8',
    intro:
      'A wind-down ritual works because it is repeatable, not because it is elaborate. Three steps, same order, same time.',
    summary:
      'Light, sound, and one physical cue are enough. Anything longer competes with sleep instead of leading to it.',
    markdown: enBody(
      'an evening ritual',
      'https://www.amazon.com/dp/B000INCSAND?tag=alpha-20',
      'Low-smoke sandalwood sticks',
    ),
  },
  {
    slug: 'best-yoga-bolsters',
    title: '4 Yoga Bolsters for Restorative Practice',
    template: 'listicle',
    status: 'draft',
    offsetDays: 0,
    color: '#0f766e',
    intro: 'Draft fixture — this post must never appear on the public site.',
    summary: 'Draft fixture summary.',
    products: [
      {
        title: 'Rectangular Cotton Bolster',
        description: 'Firm support for supine poses, filled with cotton batting rather than foam.',
        affiliateUrl: 'https://www.amazon.com/dp/B000YOGABOL?tag=alpha-20',
      },
      {
        title: 'Round Pranayama Bolster',
        description: 'Narrower and taller, designed to open the chest along the spine.',
        affiliateUrl: 'https://www.amazon.com/dp/B000YOGAPRA?tag=alpha-20',
      },
      {
        title: 'Travel Bolster',
        description: 'Packs flat and inflates, at the cost of a less stable surface.',
        affiliateUrl: 'https://www.amazon.com/dp/B000YOGATRV?tag=alpha-20',
      },
    ],
  },
  {
    slug: 'morning-light-and-mood',
    title: 'Morning Light and Mood: What the Research Actually Says',
    template: 'informational',
    status: 'scheduled',
    offsetDays: 3,
    color: '#b45309',
    intro: 'Scheduled fixture — this post publishes in the future and must not be live yet.',
    summary: 'Scheduled fixture summary.',
    markdown: enBody(
      'a morning routine',
      'https://www.amazon.com/dp/B000LIGHTBOX?tag=alpha-20',
      'A 10,000 lux lamp',
    ),
  },
]

const betaPosts: SeedPost[] = [
  {
    slug: 'bedste-meditationspuder',
    title: 'De 4 bedste meditationspuder til daglig praksis',
    template: 'listicle',
    status: 'published',
    offsetDays: 2,
    color: '#065f46',
    intro:
      'En pude, der passer til din krop, er forskellen på at sidde i tyve minutter og at give op efter fem. Disse fire holder faconen og holder hofterne over knæene.',
    summary:
      'For de fleste er en boghvedepude den rigtige første pude. Skift først til kapok, når du ved, hvor længe du faktisk sidder.',
    products: [
      {
        title: 'Zafu med boghvedeskaller',
        description:
          'Fast, justerbar og tung nok til at blive liggende. Skallerne former sig efter dig, og du kan tage nogle ud for at sænke sædet.',
        affiliateUrl: 'https://www.amazon.de/dp/B000MEDZAFU?tag=beta-21',
      },
      {
        title: 'Rund kapokpude',
        description:
          'Blødere end boghvede og markant lettere, hvilket gør den bedre, hvis puden flytter sig mellem rum.',
        affiliateUrl: 'https://www.amazon.de/dp/B000MEDKAPO?tag=beta-21',
      },
      {
        title: 'Halvmånepude',
        description:
          'Den udskårne forkant lader knæene falde mod gulvet, hvilket hjælper, hvis stramme hofter gør en rund pude ubehagelig.',
        affiliateUrl: 'https://www.amazon.de/dp/B000MEDCRES?tag=beta-21',
      },
      {
        title: 'Zabuton gulvmåtte',
        description:
          'Ikke en pude i sig selv, men en polstret bund, der holder ankler og knæ fri af et hårdt gulv. Brug den under en af ovenstående.',
        affiliateUrl: 'https://www.amazon.de/dp/B000MEDZABU?tag=beta-21',
      },
    ],
  },
  {
    slug: 'bedste-klangskaale',
    title: '5 klangskåle, der er værd at eje — testet på klang',
    template: 'listicle',
    status: 'published',
    offsetDays: 6,
    color: '#047857',
    intro:
      'De fleste klangskåle på nettet er pressede og ikke håndhamrede, og det kan høres med det samme. Disse fem holder en ren tone.',
    summary:
      'Håndhamrede skåle koster mere og lyder bedre. Køber du kun én skål, så køb den største, du har råd til.',
    products: [
      {
        title: 'Håndhamret himalaya-skål, 15 cm',
        description:
          'En lang og jævn efterklang næsten uden svingninger. De synlige hammerspor er meningen — ikke en fejl.',
        affiliateUrl: 'https://www.amazon.de/dp/B000BOWLHIM?tag=beta-21',
      },
      {
        title: 'Krystalskål i kvarts, F-tone',
        description:
          'Kraftigere og renere end metal, men langt mere skrøbelig. Bedst i et rum, hvor den kan blive stående.',
        affiliateUrl: 'https://www.amazon.de/dp/B000BOWLQTZ?tag=beta-21',
      },
      {
        title: 'Rejseskål med etui',
        description:
          'Lille nok til rygsækken. Tonen er tyndere end en fuldstørrelsesskål — det er prisen for at kunne tage den med.',
        affiliateUrl: 'https://www.amazon.de/dp/B000BOWLTRV?tag=beta-21',
      },
      {
        title: 'Køllesæt med læderbetræk',
        description:
          'En blød kølle til lange toner og en hård til et tydeligt anslag. De fleste skåle leveres kun med én.',
        affiliateUrl: 'https://www.amazon.de/dp/B000BOWLSTR?tag=beta-21',
      },
    ],
  },
  {
    slug: 'bedste-roegelse-til-meditation',
    title: '3 røgelsestyper, der ikke overdøver et lille rum',
    template: 'listicle',
    status: 'published',
    offsetDays: 11,
    color: '#0d9488',
    intro:
      'Røgelse skal markere starten på en session — ikke fylde lejligheden en hel dag. Disse tre brænder rent og forsvinder til tiden.',
    summary:
      'Japanske pinde er det sikreste valg indendørs. Harpiks kræver udluftning og opmærksomhed, som en daglig praksis sjældent har plads til.',
    products: [
      {
        title: 'Japanske sandeltræspinde',
        description:
          'Lidt røg, cirka femogtyve minutter pr. pind og ingen bambuskerne, der giver en brændt bismag.',
        affiliateUrl: 'https://www.amazon.de/dp/B000INCSAND?tag=beta-21',
      },
      {
        title: 'Palo santo-pinde',
        description:
          'Sødt og harpiksagtigt. Køb kun fra sælgere, der oplyser deres kilde — træet er under reelt pres.',
        affiliateUrl: 'https://www.amazon.de/dp/B000INCPALO?tag=beta-21',
      },
      {
        title: 'Frankincense-harpiks med brænder',
        description:
          'Den kraftigste mulighed her og den mest besværlige. Du skal bruge kul, en varmefast skål og et åbent vindue.',
        affiliateUrl: 'https://www.amazon.de/dp/B000INCFRAN?tag=beta-21',
      },
    ],
  },
  {
    slug: 'kom-i-gang-med-meditation',
    title: 'Sådan starter du en meditationspraksis, der overlever den første måned',
    template: 'informational',
    status: 'published',
    offsetDays: 4,
    color: '#115e59',
    intro:
      'Næsten alle, der stopper med at meditere, stopper i de første tre uger. Løsningen er ikke disciplin — det er et mindre udgangspunkt.',
    summary:
      'Fem minutter på samme tidspunkt hver dag slår tredive minutter, når det lige passer. Byg tidspunktet først, og forlæng bagefter.',
    markdown: daBody(
      'et begynderopsæt til meditation',
      'https://www.amazon.de/dp/B000MEDZAFU?tag=beta-21',
      'Denne zafu med boghvedeskaller',
    ),
  },
  {
    slug: 'siddestilling-til-meditation',
    title: 'Siddestilling til meditation: en praktisk guide',
    template: 'informational',
    status: 'published',
    offsetDays: 9,
    color: '#0369a1',
    intro:
      'Rygsmerter under meditation handler næsten altid om hoftehøjde og ikke om viljestyrke. Sådan sætter du dit sæde.',
    summary:
      'Få hofterne over knæene, lad rygsøjlen stable sig selv, og hold op med at tvinge en stilling, kroppen endnu ikke kan nå.',
    markdown: daBody(
      'et meditationssæde',
      'https://www.amazon.de/dp/B000MEDCRES?tag=beta-21',
      'En halvmånepude',
    ),
  },
  {
    slug: 'aftenritual-der-holder',
    title: 'Et aftenritual, du rent faktisk kan holde fast i',
    template: 'informational',
    status: 'published',
    offsetDays: 14,
    color: '#1e40af',
    intro:
      'Et aftenritual virker, fordi det kan gentages — ikke fordi det er omfattende. Tre trin, samme rækkefølge, samme tidspunkt.',
    summary:
      'Lys, lyd og ét fysisk signal er nok. Alt længere konkurrerer med søvnen i stedet for at føre til den.',
    markdown: daBody(
      'et aftenritual',
      'https://www.amazon.de/dp/B000INCSAND?tag=beta-21',
      'Japanske sandeltræspinde med lidt røg',
    ),
  },
  {
    slug: 'bedste-yogaboltere',
    title: '4 yogaboltere til restorativ praksis',
    template: 'listicle',
    status: 'draft',
    offsetDays: 0,
    color: '#7c2d12',
    intro: 'Kladdefikstur — dette indlæg må aldrig vises på det offentlige site.',
    summary: 'Opsummering for kladdefikstur.',
    products: [
      {
        title: 'Rektangulær bolster i bomuld',
        description: 'Fast støtte til liggende stillinger, fyldt med bomuldsvat frem for skum.',
        affiliateUrl: 'https://www.amazon.de/dp/B000YOGABOL?tag=beta-21',
      },
      {
        title: 'Rund pranayama-bolster',
        description: 'Smallere og højere, lavet til at åbne brystkassen langs rygsøjlen.',
        affiliateUrl: 'https://www.amazon.de/dp/B000YOGAPRA?tag=beta-21',
      },
      {
        title: 'Rejsebolster',
        description: 'Pakkes fladt og pustes op — til gengæld er overfladen mindre stabil.',
        affiliateUrl: 'https://www.amazon.de/dp/B000YOGATRV?tag=beta-21',
      },
    ],
  },
  {
    slug: 'morgenlys-og-humoer',
    title: 'Morgenlys og humør: hvad forskningen faktisk siger',
    template: 'informational',
    status: 'scheduled',
    offsetDays: 3,
    color: '#a16207',
    intro: 'Planlagt fikstur — dette indlæg udgives i fremtiden og må ikke være live endnu.',
    summary: 'Opsummering for planlagt fikstur.',
    markdown: daBody(
      'en morgenrutine',
      'https://www.amazon.de/dp/B000LIGHTBOX?tag=beta-21',
      'En lampe på 10.000 lux',
    ),
  },
]

const gammaPosts: SeedPost[] = [
  {
    // Deliberately the same slug as Alpha's first post, on a different domain.
    slug: 'best-meditation-cushions',
    title: 'Best Meditation Cushions for Desk Workers and Tight Hips',
    template: 'listicle',
    status: 'published',
    offsetDays: 3,
    color: '#be123c',
    intro:
      'Gamma covers wellness rather than spiritual practice, so this list is written for people who sit at a desk all day. Same slug as Alpha, different article.',
    summary:
      'If you sit eight hours a day, prioritise hip height over softness. This is a different recommendation than a general meditation audience would get.',
    products: [
      {
        title: 'Ergonomic Wedge Cushion',
        description:
          'Tilts the pelvis forward the way a good desk chair does, which makes floor sitting possible after a long workday.',
        affiliateUrl: 'https://www.amazon.com/dp/B000WEDGECU?tag=gamma-20',
      },
      {
        title: 'High-Loft Buckwheat Zafu',
        description:
          'Taller than a standard zafu. The extra height is what tight hip flexors actually need.',
        affiliateUrl: 'https://www.amazon.com/dp/B000HIGHZAF?tag=gamma-20',
      },
      {
        title: 'Kneeling Bench',
        description:
          'Takes the hips out of the equation entirely by shifting the load to the shins. Worth trying before giving up on floor sitting.',
        affiliateUrl: 'https://www.amazon.com/dp/B000KNEELBN?tag=gamma-20',
      },
    ],
  },
  {
    slug: 'best-desk-stretch-tools',
    title: '4 Desk Stretch Tools That Are Worth the Drawer Space',
    template: 'listicle',
    status: 'published',
    offsetDays: 7,
    color: '#e11d48',
    intro:
      'Most desk stretch gadgets get used twice. These four earn their place because they work in under two minutes.',
    summary:
      'A lacrosse ball and a doorway strap cover most of what a desk worker needs. Everything else is optional.',
    products: [
      {
        title: 'Lacrosse Ball',
        description:
          'The cheapest useful item on this list. Pin it between your shoulder blade and a wall and lean.',
        affiliateUrl: 'https://www.amazon.com/dp/B000LACROSS?tag=gamma-20',
      },
      {
        title: 'Doorway Stretch Strap',
        description:
          'Anchors at any height, which is what makes a chest opener possible without a partner.',
        affiliateUrl: 'https://www.amazon.com/dp/B000DOORSTR?tag=gamma-20',
      },
      {
        title: 'Foot Roller',
        description:
          'Two minutes under the desk. Helps more with lower-back stiffness than most people expect.',
        affiliateUrl: 'https://www.amazon.com/dp/B000FOOTROL?tag=gamma-20',
      },
      {
        title: 'Resistance Band Set',
        description:
          'Light bands only. Heavy bands turn a stretch break into a workout you will skip.',
        affiliateUrl: 'https://www.amazon.com/dp/B000RESBAND?tag=gamma-20',
      },
    ],
  },
  {
    slug: 'best-sleep-masks',
    title: '3 Sleep Masks That Stay On All Night',
    template: 'listicle',
    status: 'published',
    offsetDays: 12,
    color: '#9f1239',
    intro:
      'A mask that slides off at 3am is worse than no mask. These three stay put without pressing on your eyes.',
    summary:
      'Contoured masks are the right default. Flat silk looks nicer and blocks less light.',
    products: [
      {
        title: 'Contoured Memory Foam Mask',
        description:
          'Domed eye cups mean no pressure on the lids, so side sleepers can actually use it.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MASKCON?tag=gamma-20',
      },
      {
        title: 'Weighted Silk Mask',
        description:
          'The weight is the point — it is calming in the same way a weighted blanket is. Blocks less light than contoured foam.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MASKSILK?tag=gamma-20',
      },
      {
        title: 'Wrap-Around Blackout Mask',
        description:
          'The most complete blackout here, and the warmest. Best in a cool room.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MASKWRAP?tag=gamma-20',
      },
    ],
  },
  {
    slug: 'desk-posture-basics',
    title: 'Desk Posture Basics That Hold Up After Lunch',
    template: 'informational',
    status: 'published',
    offsetDays: 5,
    color: '#a21caf',
    intro:
      'Perfect posture is not a position you hold — it is a position you keep returning to. Here is the setup that makes returning easy.',
    summary:
      'Screen height and chair depth do most of the work. Everything else is a reminder system.',
    markdown: enBody(
      'a desk setup',
      'https://www.amazon.com/dp/B000WEDGECU?tag=gamma-20',
      'An ergonomic wedge cushion',
    ),
  },
  {
    slug: 'hydration-myths',
    title: 'Hydration Myths That Will Not Die',
    template: 'informational',
    status: 'published',
    offsetDays: 10,
    color: '#7e22ce',
    intro:
      'Eight glasses a day was never a research finding. Here is what actually determines how much water you need.',
    summary:
      'Thirst is a better guide than a number, with a few specific exceptions worth knowing.',
    markdown: enBody(
      'a daily water routine',
      'https://www.amazon.com/dp/B000WATERBTL?tag=gamma-20',
      'An insulated 1L bottle',
    ),
  },
  {
    slug: 'walking-breaks-at-work',
    title: 'Walking Breaks at Work: How Short Is Too Short?',
    template: 'informational',
    status: 'published',
    offsetDays: 15,
    color: '#c026d3',
    intro:
      'Two minutes every half hour beats a single long walk at lunch, and the reason has nothing to do with step counts.',
    summary:
      'Frequency matters more than duration. Set the interval, not the distance.',
    markdown: enBody(
      'a walking break routine',
      'https://www.amazon.com/dp/B000FOOTROL?tag=gamma-20',
      'A foot roller for afterwards',
    ),
  },
  {
    slug: 'best-standing-desk-mats',
    title: '4 Standing Desk Mats Compared',
    template: 'listicle',
    status: 'draft',
    offsetDays: 0,
    color: '#0369a1',
    intro: 'Draft fixture — this post must never appear on the public site.',
    summary: 'Draft fixture summary.',
    products: [
      {
        title: 'Contoured Anti-Fatigue Mat',
        description: 'Raised edges encourage small position changes rather than static standing.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MATCONT?tag=gamma-20',
      },
      {
        title: 'Flat Foam Mat',
        description: 'Cheaper and easier to clean, with no built-in movement cues.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MATFLAT?tag=gamma-20',
      },
      {
        title: 'Cork Mat',
        description: 'Firmer underfoot and the best-looking option, at roughly twice the price.',
        affiliateUrl: 'https://www.amazon.com/dp/B000MATCORK?tag=gamma-20',
      },
    ],
  },
  {
    slug: 'afternoon-energy-dips',
    title: 'Afternoon Energy Dips Are Normal — Here Is What Helps',
    template: 'informational',
    status: 'scheduled',
    offsetDays: 3,
    color: '#0f766e',
    intro: 'Scheduled fixture — this post publishes in the future and must not be live yet.',
    summary: 'Scheduled fixture summary.',
    markdown: enBody(
      'an afternoon reset',
      'https://www.amazon.com/dp/B000WATERBTL?tag=gamma-20',
      'An insulated bottle',
    ),
  },
]

const domains: SeedDomain[] = [
  {
    name: 'Alpha',
    hostname: 'alpha.localhost',
    timezone: 'America/New_York',
    locale: 'en-US',
    nicheSlug: 'spirituality',
    primaryColor: '#6d28d9',
    affiliate: { source: 'mock', marketplace: 'amazon.com', partnerTag: 'alpha-20' },
    dataforseo: { locationCode: 2840, languageCode: 'en' },
    accentColor: '#f59e0b',
    posts: alphaPosts,
    pages: enPages('Alpha'),
  },
  {
    name: 'Beta',
    hostname: 'beta.localhost',
    timezone: 'Europe/Copenhagen',
    locale: 'da-DK',
    nicheSlug: 'spirituality',
    primaryColor: '#047857',
    affiliate: { source: 'mock', marketplace: 'amazon.de', partnerTag: 'beta-21' },
    dataforseo: { locationCode: 2208, languageCode: 'da' },
    accentColor: '#ea580c',
    posts: betaPosts,
    pages: daPages('Beta'),
  },
  {
    name: 'Gamma',
    hostname: 'gamma.localhost',
    timezone: 'America/Los_Angeles',
    locale: 'en-US',
    nicheSlug: 'wellness',
    primaryColor: '#be123c',
    affiliate: { source: 'mock', marketplace: 'amazon.com', partnerTag: 'gamma-20' },
    dataforseo: { locationCode: 2840, languageCode: 'en' },
    accentColor: '#0891b2',
    posts: gammaPosts,
    pages: enPages('Gamma'),
  },
]

// ---------------------------------------------------------------- helpers

const DAY = 24 * 60 * 60 * 1000

/** A placeholder hero image, generated locally so the seed needs no network or image API. */
async function placeholderImage(dir: string, name: string, color: string): Promise<string> {
  const filePath = path.join(dir, `${name}.jpg`)
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
       <rect width="1200" height="630" fill="${color}"/>
       <circle cx="980" cy="120" r="220" fill="#ffffff" fill-opacity="0.08"/>
       <circle cx="220" cy="560" r="300" fill="#000000" fill-opacity="0.10"/>
     </svg>`,
  )
  await writeFile(filePath, await sharp(svg).jpeg({ quality: 80 }).toBuffer())
  return filePath
}

async function upsertNiche(payload: Payload, name: string, slug: string, description: string) {
  const existing = await payload.find({ collection: 'niches', where: { slug: { equals: slug } }, limit: 1 })
  if (existing.docs[0]) {
    return payload.update({ collection: 'niches', id: existing.docs[0].id, data: { name, description } })
  }
  return payload.create({ collection: 'niches', data: { name, slug, description } })
}

async function upsertMedia(payload: Payload, alt: string, filePath: string) {
  const existing = await payload.find({ collection: 'media', where: { alt: { equals: alt } }, limit: 1 })
  if (existing.docs[0]) return existing.docs[0]
  return payload.create({ collection: 'media', data: { alt }, filePath })
}

// ---------------------------------------------------------------- seed

const payload = await getPayload({ config })
const editorConfig = await editorConfigFactory.default({ config: payload.config })
const tempDir = await mkdtemp(path.join(tmpdir(), 'seoblog-seed-'))

try {
  const spirituality = await upsertNiche(
    payload,
    'Spirituality',
    'spirituality',
    'Meditation, ritual, and contemplative practice. The launch niche.',
  )
  const wellness = await upsertNiche(
    payload,
    'Wellness',
    'wellness',
    'Everyday physical wellbeing. Local seed fixture only — no launch domain uses it.',
  )
  const nicheIds: Record<string, number> = {
    spirituality: Number(spirituality.id),
    wellness: Number(wellness.id),
  }

  for (const seedDomain of domains) {
    const existingDomain = await payload.find({
      collection: 'domains',
      where: { hostname: { equals: seedDomain.hostname } },
      limit: 1,
    })

    const domainData = {
      name: seedDomain.name,
      hostname: seedDomain.hostname,
      locale: seedDomain.locale,
      timezone: seedDomain.timezone,
      schedule: { postsPerDay: 10, windowStart: '08:00', windowEnd: '23:30', jitterMinutes: 8 },
      niche: nicheIds[seedDomain.nicheSlug],
      affiliate: seedDomain.affiliate,
      dataforseo: seedDomain.dataforseo,
      branding: {
        primaryColor: seedDomain.primaryColor,
        accentColor: seedDomain.accentColor,
      },
    }

    const domain = existingDomain.docs[0]
      ? await payload.update({
          collection: 'domains',
          id: existingDomain.docs[0].id,
          data: domainData,
        })
      : await payload.create({ collection: 'domains', data: domainData })
    const domainId = domain.id

    for (const seedPost of seedDomain.posts) {
      const imageAlt = `${seedDomain.name}: ${seedPost.title}`
      const filePath = await placeholderImage(
        tempDir,
        `${seedDomain.hostname}-${seedPost.slug}-${randomUUID().slice(0, 8)}`,
        seedPost.color,
      )
      const media = await upsertMedia(payload, imageAlt, filePath)

      const now = Date.now()
      const data = {
        title: seedPost.title,
        domain: domainId,
        template: seedPost.template,
        slug: seedPost.slug,
        status: seedPost.status,
        intro: seedPost.intro,
        summary: seedPost.summary,
        featuredImage: media.id,
        meta: {
          title: `${seedPost.title} | ${seedDomain.name}`,
          description:
            seedPost.intro.length > 160 ? `${seedPost.intro.slice(0, 157).trimEnd()}…` : seedPost.intro,
          image: media.id,
        },
        publishedAt:
          seedPost.status === 'published' ? new Date(now - seedPost.offsetDays * DAY).toISOString() : null,
        scheduledAt:
          seedPost.status === 'scheduled' ? new Date(now + seedPost.offsetDays * DAY).toISOString() : null,
        ...(seedPost.template === 'listicle'
          ? {
              products: (seedPost.products ?? []).map((product, index) => ({
                ...product,
                imageUrl: `https://picsum.photos/seed/${seedPost.slug}-${index + 1}/800/800`,
              })),
            }
          : {
              body: convertMarkdownToLexical({ editorConfig, markdown: seedPost.markdown ?? '' }),
            }),
      }

      const existingPost = await payload.find({
        collection: 'posts',
        where: { and: [{ domain: { equals: domainId } }, { slug: { equals: seedPost.slug } }] },
        limit: 1,
      })

      if (existingPost.docs[0]) {
        await payload.update({ collection: 'posts', id: existingPost.docs[0].id, data })
      } else {
        await payload.create({ collection: 'posts', data })
      }
    }

    for (const seedPage of seedDomain.pages) {
      const pageData = {
        title: seedPage.title,
        domain: domainId,
        type: seedPage.type,
        slug: seedPage.slug,
        status: 'published' as const,
        body: convertMarkdownToLexical({ editorConfig, markdown: seedPage.markdown }),
        meta: {
          title: `${seedPage.title} | ${seedDomain.name}`,
          description: `${seedPage.title} — ${seedDomain.name}`,
        },
      }

      const existingPage = await payload.find({
        collection: 'pages',
        where: { and: [{ domain: { equals: domainId } }, { slug: { equals: seedPage.slug } }] },
        limit: 1,
      })

      if (existingPage.docs[0]) {
        await payload.update({ collection: 'pages', id: existingPage.docs[0].id, data: pageData })
      } else {
        await payload.create({ collection: 'pages', data: pageData })
      }
    }

    payload.logger.info(
      `Seeded ${seedDomain.hostname} (${seedDomain.locale}) with ${seedDomain.posts.length} posts and ${seedDomain.pages.length} pages`,
    )
  }

  // The cron routes update this global concurrently; create its single row up front.
  await payload.updateGlobal({ slug: 'scheduler-status', data: {} })

  const counts = await Promise.all(
    ['niches', 'domains', 'posts', 'pages', 'media'].map(async (collection) => {
      const result = await payload.count({ collection: collection as 'posts' })
      return `${collection}=${result.totalDocs}`
    }),
  )
  payload.logger.info(`Seed complete: ${counts.join(' ')}`)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

process.exit(0)
