import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import RangeIQ from './RangeIQ.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RangeIQ />
    <Analytics />
  </React.StrictMode>
)
