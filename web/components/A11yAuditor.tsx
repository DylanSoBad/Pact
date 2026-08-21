'use client'

import { useEffect } from 'react'
import React from 'react'
import ReactDOM from 'react-dom'

export default function A11yAuditor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      import('@axe-core/react')
        .then((axe) => {
          axe.default(React, ReactDOM, 1000)
        })
        .catch((err) => {
          // silently catch if axe is not bundled in specific environments
          console.debug('A11y auditor skipped:', err)
        })
    }
  }, [])

  return null
}
