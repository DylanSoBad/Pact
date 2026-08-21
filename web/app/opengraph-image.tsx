import { ImageResponse } from 'next/og'

export const alt = 'PACT Protocol — Economic Contracts on ARC'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#07080a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 80px',
          border: '12px solid #18191c',
          fontFamily: 'monospace',
          color: '#ffffff',
          position: 'relative',
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            background: 'radial-gradient(circle, rgba(198, 243, 64, 0.15) 0%, rgba(0,0,0,0) 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Header telemetry */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid #27272a',
            paddingBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                background: '#c8f542',
                borderRadius: '2px',
                boxShadow: '0 0 12px #c8f542',
              }}
            />
            <span style={{ fontSize: '24px', letterSpacing: '4px', color: '#c8f542', fontWeight: 'bold' }}>
              PACT PROTOCOL
            </span>
          </div>
          <span style={{ fontSize: '18px', color: '#a1a1aa', letterSpacing: '2px' }}>
            ARC TESTNET // 5042002
          </span>
        </div>

        {/* Center content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
          <div
            style={{
              fontSize: '56px',
              fontWeight: '900',
              lineHeight: 1.1,
              letterSpacing: '-1px',
              color: '#ffffff',
            }}
          >
            THE TAPE
          </div>
          <div
            style={{
              fontSize: '26px',
              color: '#a1a1aa',
              lineHeight: 1.4,
              maxWidth: '850px',
            }}
          >
            Create, manage, and track economic contracts with collateral on ARC. Not a DEX — real agreements.
          </div>
        </div>

        {/* Footer badges */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '2px solid #27272a',
            paddingTop: '20px',
          }}
        >
          <div style={{ display: 'flex', gap: '24px', fontSize: '16px', color: '#71717a' }}>
            <span>&gt; ESCROW COLLATERAL</span>
            <span>&gt; TIME LOCKS</span>
            <span>&gt; PROOF OF DELIVERY</span>
          </div>
          <div
            style={{
              background: '#c8f542',
              color: '#000000',
              padding: '8px 20px',
              fontWeight: 'bold',
              fontSize: '18px',
              borderRadius: '2px',
              letterSpacing: '1px',
            }}
          >
            LIVE STREAM
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
