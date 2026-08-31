'use client'

import { useState, useEffect, useRef } from 'react'

export interface LifecycleStage {
  step: string
  title: string
  description: string
  role: string
  stateTag: string
  codeSnippet: string
}

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    step: '01',
    title: 'TERMS',
    description: 'Both parties commit to exact written terms anchored by a cryptographic digest.',
    role: 'Maker & Counterparty',
    stateTag: 'STATE: 0 (OFFERED)',
    codeSnippet: 'bytes32 termsHash = sha256(plaintextTerms);',
  },
  {
    step: '02',
    title: 'LOCK',
    description: 'Maker and counterparty authorize exact collateral into the PACT vault.',
    role: 'Maker & Counterparty',
    stateTag: 'STATE: 1 (ACTIVE)',
    codeSnippet: 'vault.depositExact(makerAmount, takerAmount);',
  },
  {
    step: '03',
    title: 'PERFORM',
    description: 'The designated party performs the agreed off-chain obligation.',
    role: 'Performer / Counterparty',
    stateTag: 'STATE: 1 (PERFORMING)',
    codeSnippet: 'require(block.timestamp <= performanceDeadline);',
  },
  {
    step: '04',
    title: 'REVIEW',
    description: 'Proof can be accepted, challenged, or escalated through the dispute window.',
    role: 'Reviewer / Arbiter',
    stateTag: 'STATE: 2 (PROOF IN) / 3 (DISPUTED)',
    codeSnippet: 'if (disputed) arbiter.resolve(pactId, split);',
  },
  {
    step: '05',
    title: 'SETTLE',
    description: 'Collateral and payment are released, refunded, or awarded according to the final state.',
    role: 'PACT Smart Contract',
    stateTag: 'STATE: 4 (SETTLED)',
    codeSnippet: 'token.transfer(destination, totalPayout);',
  },
]

export default function SettlementRail() {
  const [activeStage, setActiveStage] = useState<number>(0)
  const stageRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const observers: IntersectionObserver[] = []

    stageRefs.current.forEach((el, index) => {
      if (!el) return
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
              setActiveStage(index)
            }
          })
        },
        {
          rootMargin: '-15% 0px -40% 0px',
          threshold: [0.4, 0.7],
        }
      )
      observer.observe(el)
      observers.push(observer)
    })

    return () => {
      observers.forEach((obs) => obs.disconnect())
    }
  }, [])

  return (
    <section
      aria-label="Settlement Lifecycle Rail"
      className="relative w-full border-y border-outline-hairline bg-[#07090c] py-16 sm:py-24"
    >
      {/* Background Subtle Grid Alignment */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(200, 245, 66, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(200, 245, 66, 0.4) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative mx-auto max-w-[1368px] px-4 sm:px-8 lg:px-14">
        {/* Section Header */}
        <header className="mb-12 max-w-3xl sm:mb-16">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-[1px] bg-primary-fixed"
            />
            <p className="font-label-caps text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-fixed">
              Settlement Lifecycle
            </p>
          </div>
          <h2 className="mt-3 font-editorial text-[32px] font-normal leading-[1.12] tracking-[-0.03em] text-[#f4f5f7] sm:text-[40px] md:text-[44px]">
            From written intent to irreversible settlement.
          </h2>
          <p className="mt-4 font-body-sans text-[14px] leading-[1.65] text-text-muted sm:text-[15px]">
            PACT turns off-chain agreements into cryptographically verified smart contract obligations.
            Collateral is locked in non-custodial custody until exact criteria are validated or expired.
          </p>
        </header>

        {/* The Interactive Settlement Rail Structure */}
        <div className="relative grid gap-8 lg:grid-cols-12 lg:gap-12">
          {/* Left / Desktop Sticky Progress Indicator & Telemetry */}
          <aside
            aria-hidden="true"
            className="hidden lg:col-span-4 lg:block"
          >
            <div className="sticky top-28 space-y-6 rounded-[2px] border border-outline-hairline bg-[#0c0f12] p-6">
              <div className="flex items-center justify-between border-b border-outline-hairline pb-4">
                <span className="font-label-caps text-[10px] uppercase tracking-[0.14em] text-text-dim">
                  Execution State
                </span>
                <span className="flex items-center gap-1.5 font-code-hash text-[11px] text-primary-fixed">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed live-dot" />
                  Stage {activeStage + 1} of 5
                </span>
              </div>

              {/* Progress Stepper Visual */}
              <div className="space-y-3">
                {LIFECYCLE_STAGES.map((s, idx) => {
                  const isCurrent = idx === activeStage
                  const isDone = idx < activeStage
                  return (
                    <div
                      key={s.step}
                      className={`flex items-center gap-3 font-code-hash text-[12px] transition-colors duration-200 ${
                        isCurrent
                          ? 'text-primary-fixed font-bold'
                          : isDone
                          ? 'text-text-muted'
                          : 'text-text-dim/50'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-[1px] border text-[10px] transition-all ${
                          isCurrent
                            ? 'border-primary-fixed bg-primary-fixed text-[#090b0d] font-bold shadow-[0_0_8px_rgba(200,245,66,0.35)]'
                            : isDone
                            ? 'border-primary-fixed/40 bg-primary-fixed/10 text-primary-fixed'
                            : 'border-outline-border bg-[#07080a] text-text-dim'
                        }`}
                      >
                        {isDone ? '✓' : s.step}
                      </span>
                      <span className="font-headline-mono tracking-wider">{s.title}</span>
                      {isCurrent && (
                        <span className="ml-auto font-label-caps text-[9px] uppercase tracking-widest text-primary-fixed/80">
                          Active
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Technical Code Representation */}
              <div className="mt-6 border-t border-outline-hairline pt-4">
                <p className="font-label-caps text-[9px] uppercase tracking-[0.14em] text-text-dim">
                  Smart Contract Assertion
                </p>
                <pre className="mt-2 overflow-x-auto rounded-[2px] bg-[#07080a] p-3 font-code-hash text-[11px] leading-5 text-text-muted">
                  <code>{LIFECYCLE_STAGES[activeStage]?.codeSnippet}</code>
                </pre>
              </div>
            </div>
          </aside>

          {/* Right / Stepper Flow with Continuous Vertical Rail */}
          <div className="relative lg:col-span-8">
            {/* Continuous Vertical Lime Track */}
            <div
              aria-hidden="true"
              className="absolute bottom-8 left-4 top-8 w-px bg-outline-border md:left-6"
            >
              {/* Dynamic scroll progress fill on the rail */}
              <div
                className="w-full bg-primary-fixed transition-all duration-300 motion-reduce:transition-none"
                style={{
                  height: `${((activeStage + 1) / LIFECYCLE_STAGES.length) * 100}%`,
                  boxShadow: '0 0 10px rgba(200, 245, 66, 0.4)',
                }}
              />
            </div>

            {/* Stages List */}
            <ol className="space-y-6 md:space-y-8">
              {LIFECYCLE_STAGES.map((stage, index) => {
                const isCurrent = index === activeStage
                const isDone = index < activeStage

                return (
                  <li
                    key={stage.step}
                    ref={(el) => {
                      stageRefs.current[index] = el
                    }}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`relative pl-12 sm:pl-16 transition-all duration-200 ${
                      isCurrent
                        ? 'opacity-100'
                        : isDone
                        ? 'opacity-85'
                        : 'opacity-50 hover:opacity-75'
                    }`}
                  >
                    {/* Stepper Node Marker on Rail */}
                    <div
                      aria-hidden="true"
                      className={`absolute left-2.5 top-5 -translate-x-1/2 flex h-7 w-7 items-center justify-center rounded-[1px] border transition-all md:left-4.5 ${
                        isCurrent
                          ? 'border-primary-fixed bg-[#0c0f12] text-primary-fixed shadow-[0_0_12px_rgba(200,245,66,0.5)] pact-node-active'
                          : isDone
                          ? 'border-primary-fixed/50 bg-[#090d0b] text-primary-fixed'
                          : 'border-outline-border bg-[#0c0f12] text-text-dim'
                      }`}
                    >
                      <span className="font-code-hash text-[11px] font-bold">
                        {isDone ? '✓' : stage.step}
                      </span>
                    </div>

                    {/* Stage Card */}
                    <article
                      className={`rounded-[2px] border p-5 sm:p-6 transition-all ${
                        isCurrent
                          ? 'border-primary-fixed/60 bg-[#0e1318] shadow-[0_4px_24px_rgba(0,0,0,0.6)]'
                          : isDone
                          ? 'border-outline-border bg-[#0c0f12]'
                          : 'border-outline-hairline bg-[#080b0e]'
                      }`}
                    >
                      {/* Meta info bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-hairline/60 pb-3 font-code-hash text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{stage.step}</span>
                          <span className="text-text-dim">/</span>
                          <span
                            className={
                              isCurrent
                                ? 'text-primary-fixed font-bold'
                                : 'text-text-muted'
                            }
                          >
                            {stage.role}
                          </span>
                        </div>
                        <span className="rounded-[1px] border border-outline-hairline bg-[#07080a] px-2 py-0.5 text-[10px] text-text-dim">
                          {stage.stateTag}
                        </span>
                      </div>

                      {/* Main Title & Description */}
                      <div className="mt-3.5">
                        <h3 className="font-headline-mono text-[16px] font-bold uppercase tracking-wider text-white sm:text-[18px]">
                          {stage.title}
                        </h3>
                        <p className="mt-2 font-body-sans text-[13px] leading-[1.65] text-text-muted sm:text-[14px]">
                          {stage.description}
                        </p>
                      </div>

                      {/* Mobile Code snippet (< lg) */}
                      <div className="mt-4 block lg:hidden">
                        <pre className="overflow-x-auto rounded-[1px] bg-[#07080a] p-2.5 font-code-hash text-[10px] text-text-dim">
                          <code>{stage.codeSnippet}</code>
                        </pre>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
