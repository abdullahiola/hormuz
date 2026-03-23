import { Cinzel_Decorative, Orbitron } from 'next/font/google'
import './globals.css'

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['400', '700', '900'],
})

const cinzel = Cinzel_Decorative({
  subsets: ['latin'],
  variable: '--font-cinzel',
  weight: ['700'],
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata = {
  title: 'Lord of the Straits 🛢️',
  description: 'Defend the Strait of Hormuz — a browser game inspired by the Iranian animated video mocking Trump.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${orbitron.variable} ${cinzel.variable}`}>
        {children}
      </body>
    </html>
  )
}
