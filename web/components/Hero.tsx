import Link from 'next/link'
import { ArrowDown, ArrowRight } from 'lucide-react'

export const HERO_VIDEO_URL = 'https://cdn.sceneai.art/Hero%20Section%20Video/a8132a81-b526-4f91-8095-003ce931ecdd.mp4'

interface TelemetryMarker {
  id: string
  top: string
  left?: string
  right?: string
  size: number
  color: 'lime' | 'muted' | 'dim'
  opacity: number
  hideOnMobile?: boolean
}

const TELEMETRY_MARKERS: TelemetryMarker[] = [
  { id: 'node-1', top: '18%', left: '12%', size: 3, color: 'lime', opacity: 0.45, hideOnMobile: true },
  { id: 'node-2', top: '26%', right: '14%', size: 2, color: 'muted', opacity: 0.35, hideOnMobile: true },
  { id: 'node-3', top: '42%', left: '7%', size: 2, color: 'dim', opacity: 0.3, hideOnMobile: true },
  { id: 'node-4', top: '36%', right: '22%', size: 3, color: 'lime', opacity: 0.4, hideOnMobile: false },
  { id: 'node-5', top: '56%', right: '9%', size: 2, color: 'muted', opacity: 0.35, hideOnMobile: true },
  { id: 'node-6', top: '64%', left: '16%', size: 2, color: 'dim', opacity: 0.25, hideOnMobile: false },
]

function StaggeredWords({ text, accent = '', start = 0, step = 70, className = '' }: {
  text: string
  accent?: string
  start?: number
  step?: number
  className?: string
}) {
  const words = text.split(' ')

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className={`pact-hero-word inline-block ${word === accent ? 'text-primary-fixed' : ''}`}
            style={{ animationDelay: `${start + index * step}ms` }}
          >
            {word}{index < words.length - 1 ? '\u00a0' : ''}
          </span>
        ))}
      </span>
    </span>
  )
}

export default function Hero() {
  return (
    <section
      aria-label="Institutional Escrow Overview"
      className="relative flex w-full flex-col overflow-hidden min-h-[calc(100svh-3.5rem)] md:min-h-[calc(100svh-4rem)] [@supports(min-height:100dvh)]:min-h-[calc(100dvh-3.5rem)] md:[@supports(min-height:100dvh)]:min-h-[calc(100dvh-4rem)]"
      style={{
        background: 'linear-gradient(180deg, #07080a 0%, #0c0f12 48%, #12161b 100%)',
      }}
    >
      {/* Background Cinematic Video with Graceful Fallback */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        className="pact-hero-video pointer-events-none absolute inset-0 h-full w-full object-cover object-center motion-reduce:hidden"
        src={HERO_VIDEO_URL}
      />

      <div aria-hidden="true" className="pact-hero-grid pointer-events-none absolute inset-0 motion-reduce:hidden" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/25" />

      {/* Cinematic Vignette Overlay (Edge Shadow) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 90% 75% at 50% 42%, transparent 42%, rgba(7, 8, 10, 0.68) 100%)',
        }}
      />

      {/* Bottom Fade Gradient (Dissolves into page background) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(7, 8, 10, 0.04) 0%, rgba(7, 8, 10, 0.12) 38%, rgba(7, 8, 10, 0.82) 76%, #07080a 100%)',
        }}
      />

      {/* Subtle Bottom Accent Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 h-[200px] w-[640px] -translate-x-1/2 translate-y-1/3 blur-3xl opacity-50 sm:h-[260px] sm:w-[860px]"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(200, 245, 66, 0.10) 0%, transparent 70%)',
        }}
      />

      {/* Restrained Network Telemetry Markers */}
      {TELEMETRY_MARKERS.map(marker => {
        const bgClass =
          marker.color === 'lime'
            ? 'bg-primary-fixed'
            : marker.color === 'muted'
            ? 'bg-[#f4f5f7]'
            : 'bg-[#9ba3af]'

        return (
          <span
            key={marker.id}
            aria-hidden="true"
            className={`pact-network-node pointer-events-none absolute rounded-full motion-reduce:hidden ${bgClass} ${
              marker.hideOnMobile ? 'hidden sm:block' : 'block'
            }`}
            style={{
              top: marker.top,
              left: marker.left,
              right: marker.right,
              width: `${marker.size}px`,
              height: `${marker.size}px`,
              opacity: marker.opacity,
              animationDelay: `${Number(marker.id.slice(-1)) * -0.8}s`,
            }}
          />
        )
      })}

      {/* Hero Content Positioned in Lower Visual Third */}
      <div
        className="relative z-10 mx-auto mt-auto flex w-full max-w-[980px] flex-col items-center space-y-4 text-center sm:space-y-5 md:space-y-6"
        style={{
          paddingLeft: 'clamp(20px, 6vw, 80px)',
          paddingRight: 'clamp(20px, 6vw, 80px)',
          paddingBottom: 'clamp(56px, 9vh, 96px)',
        }}
      >
        {/* Eyebrow with Restrained Fading Hairline Ornaments */}
        <div className="flex w-full max-w-sm sm:max-w-md items-center justify-center gap-3">
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-gradient-to-r from-transparent to-primary-fixed/40"
          />
          <span className="font-label-caps text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-fixed shrink-0">
            INSTITUTIONAL ESCROW · ARC TESTNET
          </span>
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-gradient-to-l from-transparent to-primary-fixed/40"
          />
        </div>

        {/* Semantic H1 Display Headline */}
        <h1
          className="font-display-mono font-bold tracking-[-0.035em] text-[#f4f5f7] max-w-[900px] leading-[1.02] sm:leading-[1.05]"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 5.25rem)' }}
        >
          <StaggeredWords text="Agreements, Made Unbreakable." accent="Unbreakable." start={350} step={90} />
        </h1>

        {/* Supporting Copy */}
        <p className="max-w-[660px] font-body-sans text-[14px] leading-[1.65] text-[#f4f5f7]/75 sm:text-[15px] md:text-[16px]">
          <StaggeredWords text="Create verifiable economic agreements, lock exact collateral on-chain, and settle through transparent rules on Arc." start={1050} step={35} className="pact-hero-copy" />
        </p>

        {/* CTAs */}
        <div className="pact-hero-actions flex w-full flex-col items-center justify-center gap-3 pt-2 min-[480px]:w-auto min-[480px]:flex-row">
          <Link
            href="/new"
            className="group inline-flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-[2px] bg-primary-fixed px-[28px] py-3 font-label-caps text-[11px] font-bold uppercase tracking-[0.08em] text-[#090b0d] shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-[#d8ff63] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed min-[480px]:w-auto"
          >
            <span>Create New Pact</span>
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>

          <a
            href="#live-pacts"
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[2px] border border-white/20 bg-[#0c0f12]/75 px-6 py-3 font-label-caps text-[11px] font-semibold uppercase tracking-[0.06em] text-[#f4f5f7] backdrop-blur-sm transition-all duration-150 hover:border-primary-fixed hover:bg-[#14181e] hover:text-primary-fixed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fixed min-[480px]:w-auto"
          >
            <span>Explore Live Pacts</span>
            <ArrowDown aria-hidden="true" className="h-4 w-4 text-text-dim" />
          </a>
        </div>

        {/* Protocol Status Line */}
        <div className="pt-2 sm:pt-3">
          <p
            aria-hidden="true"
            className="font-label-caps text-[9px] sm:text-[10px] uppercase tracking-[0.16em] text-text-dim"
          >
            NON-CUSTODIAL · EXACT ERC-20 APPROVALS · ON-CHAIN TERMS HASH
          </p>
        </div>
      </div>
    </section>
  )
}
