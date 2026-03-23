import Game from './_components/Game'

export default function HomePage() {
  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(ellipse at center, #0d1b2a 0%, #060c14 100%)',
    }}>
      <Game />
    </main>
  )
}
