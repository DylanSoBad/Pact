import { getPactAddress } from '../lib/arc'

const REPOSITORY_URL = 'https://github.com/DylanSoBad/Pact'

export default function SiteFooter() {
  const protocolAddress = getPactAddress()

  return (
    <footer className="border-t border-outline-hairline bg-[#050608] px-4 py-6 font-code-hash text-[11px] text-text-dim">
      <div className="mx-auto flex max-w-terminal flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:justify-start">
          <span className="inline-block h-2 w-2 rounded-full bg-primary-fixed" aria-hidden="true" />
          <span>ARC TESTNET 5042002</span>
          <span aria-hidden="true">·</span>
          <span>PACT PROTOCOL</span>
          <span className="border border-outline-border px-1.5 py-0.5 text-[9px] uppercase text-text-muted">Testnet</span>
        </div>

        <nav aria-label="Project resources" className="flex flex-wrap items-center justify-center gap-x-1 sm:justify-end">
          <a
            className="inline-flex min-h-11 items-center px-2 text-text-muted transition-colors hover:text-primary-fixed"
            href={`${REPOSITORY_URL}/tree/main/docs`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs ↗
          </a>
          <a
            className="inline-flex min-h-11 items-center px-2 text-text-muted transition-colors hover:text-primary-fixed"
            href={REPOSITORY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source ↗
          </a>
          {protocolAddress && (
            <a
              className="inline-flex min-h-11 items-center px-2 text-text-muted transition-colors hover:text-primary-fixed"
              href={`https://testnet.arcscan.app/address/${protocolAddress}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Contract ↗
            </a>
          )}
          <span className="inline-flex min-h-11 items-center px-2 text-text-dim" title="Independent audit has not been published">
            Audit: planned
          </span>
        </nav>
      </div>
    </footer>
  )
}
