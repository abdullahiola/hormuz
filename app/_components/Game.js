'use client'

import { useEffect, useRef, useCallback } from 'react'
import styles from './Game.module.css'

// ── Constants ──────────────────────────────────────────────────────────────
const W = 900, H = 600
const SHORE_TOP = 130
const SHORE_BOT = 470
const MAX_WAVE = 6
const MAX_AMMO = 10
const RELOAD_TIME = 1400 // ms per ammo refill

function waveConfig(w) {
  return {
    count:    4 + w * 3,
    speed:    0.4 + w * 0.13,
    hp:       1 + Math.floor(w / 2),
    spacing:  Math.max(1600, 3400 - w * 280),
  }
}

// ── Audio helper ────────────────────────────────────────────────────────────
let audioCtx = null
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}
function playSound(type) {
  try {
    const ac = getAudio()
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.connect(gain); gain.connect(ac.destination)
    if (type === 'fire') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(420, ac.currentTime)
      osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.15)
      gain.gain.setValueAtTime(0.18, ac.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.15)
      osc.start(); osc.stop(ac.currentTime + 0.15)
    } else if (type === 'boom') {
      osc.type = 'square'
      osc.frequency.setValueAtTime(160, ac.currentTime)
      osc.frequency.exponentialRampToValueAtTime(20, ac.currentTime + 0.35)
      gain.gain.setValueAtTime(0.35, ac.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35)
      osc.start(); osc.stop(ac.currentTime + 0.35)
    } else if (type === 'hit') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(300, ac.currentTime)
      gain.gain.setValueAtTime(0.12, ac.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.1)
      osc.start(); osc.stop(ac.currentTime + 0.1)
    }
  } catch (_) { /* silently ignore if audio is unavailable */ }
}

// ── Ship factory ────────────────────────────────────────────────────────────
let shipId = 0
function createShip(cfg) {
  const trump = Math.random() < 0.22
  return {
    id:     shipId++,
    x:      -130,
    y:      SHORE_TOP + 35 + Math.random() * (SHORE_BOT - SHORE_TOP - 70),
    speed:  cfg.speed * (0.78 + Math.random() * 0.44),
    hp:     cfg.hp + (trump ? 2 : 0),
    maxHp:  cfg.hp + (trump ? 2 : 0),
    width:  trump ? 110 : 78,
    height: trump ? 44 : 32,
    trump,
    wobble: Math.random() * Math.PI * 2,
    reached: false,
  }
}

// ── Drawing helpers ─────────────────────────────────────────────────────────
function drawWater(ctx, t) {
  const grad = ctx.createLinearGradient(0, SHORE_TOP, 0, SHORE_BOT)
  grad.addColorStop(0,   '#0d5a7a')
  grad.addColorStop(0.5, '#0a4a6a')
  grad.addColorStop(1,   '#082e4a')
  ctx.fillStyle = grad
  ctx.fillRect(0, SHORE_TOP, W, SHORE_BOT - SHORE_TOP)
  ctx.strokeStyle = 'rgba(100,220,255,0.07)'
  ctx.lineWidth = 1
  for (let i = 0; i < 9; i++) {
    const yw = SHORE_TOP + 18 + i * ((SHORE_BOT - SHORE_TOP - 36) / 9)
    ctx.beginPath()
    for (let x = 0; x <= W; x += 4) {
      const y = yw + Math.sin(x * 0.022 + t * 0.001 + i) * 3
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

function drawLand(ctx) {
  // Top land (Oman)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, SHORE_TOP)
  skyGrad.addColorStop(0, '#1a0a00')
  skyGrad.addColorStop(1, '#3d2006')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, SHORE_TOP)
  ctx.fillStyle = '#5c3a1a'
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.ellipse(50 + i * 120 + Math.sin(i) * 28, SHORE_TOP - 10, 60 + Math.cos(i * 2) * 18, 24 + Math.sin(i * 3) * 8, 0, 0, Math.PI)
    ctx.fill()
  }
  // Bottom land (Iran)
  const landGrad = ctx.createLinearGradient(0, SHORE_BOT, 0, H)
  landGrad.addColorStop(0, '#4a2800')
  landGrad.addColorStop(1, '#2a1400')
  ctx.fillStyle = landGrad
  ctx.fillRect(0, SHORE_BOT, W, H - SHORE_BOT)
  ctx.fillStyle = '#6b3d00'
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.ellipse(80 + i * 130, SHORE_BOT + 16, 80 + Math.sin(i) * 18, 20, 0, Math.PI, Math.PI * 2)
    ctx.fill()
  }
  // Labels
  ctx.font = 'bold 13px Orbitron, monospace'
  ctx.fillStyle = 'rgba(255,200,100,0.65)'
  ctx.fillText('🇮🇷  I R A N', 20, SHORE_BOT + 62)
  ctx.fillStyle = 'rgba(255,200,100,0.45)'
  ctx.font = 'bold 11px Orbitron, monospace'
  ctx.fillText('🇴🇲  OMAN / MUSANDAM', 20, SHORE_TOP - 18)
  ctx.fillStyle = 'rgba(100,200,255,0.22)'
  ctx.font = 'bold 10px Orbitron, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('— STRAIT OF HORMUZ —', W / 2, SHORE_TOP + (SHORE_BOT - SHORE_TOP) / 2)
  ctx.textAlign = 'left'
}

function drawShip(ctx, s, t) {
  ctx.save()
  ctx.translate(s.x, s.y + Math.sin(t * 0.002 + s.wobble) * 2)
  const W2 = s.width / 2, H2 = s.height / 2

  if (s.trump) {
    // Trump flagship
    ctx.beginPath()
    ctx.moveTo(-W2, 0)
    ctx.quadraticCurveTo(-W2, -H2, 0, -H2 - 4)
    ctx.quadraticCurveTo(W2, -H2, W2, 0)
    ctx.quadraticCurveTo(W2, H2, 0, H2)
    ctx.quadraticCurveTo(-W2, H2, -W2, 0)
    ctx.fillStyle = '#cc2200'; ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.fillRect(-W2 + 8, -H2 + 8, W2 * 2 - 16, 6)
    ctx.fillStyle = '#334'; ctx.fillRect(-20, -H2 - 8, 40, 12)
    // Flag stripes
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(14, -H2 - 28, 20, 14)
    ctx.fillStyle = '#3498db'; ctx.fillRect(14, -H2 - 28, 20, 7)
    ctx.fillStyle = '#ffd700'
    ctx.font = 'bold 8px Orbitron'
    ctx.textAlign = 'center'
    ctx.fillText('TRUMP', 0, H2 - 6)
    ctx.fillStyle = '#555'; ctx.fillRect(W2 - 10, -4, 14, 8)
  } else {
    // Regular warship
    ctx.beginPath()
    ctx.moveTo(-W2, 0)
    ctx.quadraticCurveTo(-W2, -H2, 0, -H2 - 2)
    ctx.quadraticCurveTo(W2, -H2, W2, 0)
    ctx.quadraticCurveTo(W2, H2, 0, H2)
    ctx.quadraticCurveTo(-W2, H2, -W2, 0)
    ctx.fillStyle = '#456'; ctx.fill()
    ctx.strokeStyle = '#8ab'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#678'; ctx.fillRect(-W2 + 5, -H2 + 5, W2 * 2 - 10, 4)
    ctx.fillStyle = '#345'; ctx.fillRect(-12, -H2 - 6, 24, 10)
    // Flag
    ctx.fillStyle = '#c00'; ctx.fillRect(8, -H2 - 16, 14, 10)
    ctx.fillStyle = '#005'; ctx.fillRect(8, -H2 - 16, 14, 5)
    ctx.fillStyle = '#555'; ctx.fillRect(W2 - 8, -3, 12, 6)
  }

  ctx.textAlign = 'left'
  // HP bar
  const hpRatio = s.hp / s.maxHp
  const barW = s.width * 0.82, barX = -barW / 2
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(barX, H2 + 6, barW, 5)
  ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c'
  ctx.fillRect(barX, H2 + 6, barW * hpRatio, 5)

  ctx.restore()
}

function drawMissile(ctx, m) {
  for (let i = 0; i < m.trail.length; i++) {
    const alpha = (i / m.trail.length) * 0.55
    ctx.beginPath()
    ctx.arc(m.trail[i].x, m.trail[i].y, 2, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,150,0,${alpha})`
    ctx.fill()
  }
  ctx.save()
  ctx.translate(m.x, m.y)
  const angle = Math.atan2(m.ty - m.origY, m.tx - m.origX)
  ctx.rotate(angle)
  ctx.fillStyle = '#f39c12'
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#e74c3c'
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(13, 0); ctx.lineTo(7, 5); ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawTurret(ctx, t, recentFire) {
  const bx = W * 0.5, by = SHORE_BOT - 5
  ctx.save(); ctx.translate(bx, by)
  ctx.fillStyle = '#5c3a1a'
  ctx.fillRect(-32, -22, 64, 22)
  const angle = -Math.PI / 4 + Math.sin(t * 0.0008) * 0.2
  ctx.save(); ctx.translate(0, -20); ctx.rotate(angle)
  ctx.fillStyle = '#2ecc71'
  ctx.fillRect(0, -4, 36, 8)
  if (recentFire > 0) {
    ctx.fillStyle = `rgba(255,200,0,${recentFire / 10})`
    ctx.beginPath(); ctx.arc(36, 0, 9, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  // Iran flag
  ctx.fillRect(-2, -46, 2, 30)
  ctx.fillStyle = '#2ecc71'; ctx.fillRect(-1, -44, 22, 9)
  ctx.fillStyle = '#fff';    ctx.fillRect(-1, -35, 22, 9)
  ctx.fillStyle = '#e74c3c'; ctx.fillRect(-1, -26, 22, 9)
  ctx.restore()
}

function drawBarrel(ctx, x, y) {
  ctx.save(); ctx.translate(x, y)
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 14, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.ellipse(0, 2, 10, 4, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

export default function Game() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    status:        'idle', // idle | playing | over | win
    score:         0,
    oilPrice:      40,
    hp:            5,
    maxHp:         5,
    wave:          1,
    ships:         [],
    missiles:      [],
    explosions:    [],
    particles:     [],
    ammo:          MAX_AMMO,
    reloadTimer:   0,
    waveCountdown: 0,
    spawnInterval: 0,
    lastSpawn:     -9999,
    betweenWaves:  false,
    betweenTimer:  0,
    shakeTime:     0,
    recentFire:    0,
    rafId:         null,
    lastTime:      0,
  })
  const hudRef = useRef(null)
  const ammoHudRef = useRef(null)
  const startScreenRef = useRef(null)
  const gameoverScreenRef = useRef(null)
  const winScreenRef = useRef(null)

  // ── HUD update ──────────────────────────────────────────────────────────
  const updateHUD = useCallback(() => {
    const s = stateRef.current
    if (!hudRef.current) return
    hudRef.current.querySelector('#h-score').textContent = s.score
    hudRef.current.querySelector('#h-oil').textContent = '$' + s.oilPrice
    hudRef.current.querySelector('#h-wave').textContent = s.wave + '/' + MAX_WAVE
    hudRef.current.querySelector('#h-hp').textContent = s.hp
    hudRef.current.querySelector('#h-oil-bar').style.width = Math.min(100, (s.oilPrice - 40) / 160 * 100) + '%'
    hudRef.current.querySelector('#h-hp-bar').style.width = (s.hp / s.maxHp * 100) + '%'
    // ammo dots
    if (!ammoHudRef.current) return
    const dots = ammoHudRef.current.querySelectorAll('.' + styles.ammoDot)
    dots.forEach((d, i) => {
      d.classList.toggle(styles.used, i >= s.ammo)
    })
  }, [])

  // ── Spawn explosion ─────────────────────────────────────────────────────
  const spawnExplosion = useCallback((x, y, big) => {
    const s = stateRef.current
    const count = big ? 32 : 20
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * (big ? 4 : 2.5) + 1
      s.particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, decay: 0.02 + Math.random() * 0.03,
        r: 220 + Math.floor(Math.random() * 20),
        g: 80  + Math.floor(Math.random() * 140),
        b: 20, size: Math.random() * (big ? 5 : 3) + 1,
      })
    }
    s.explosions.push({ x, y, r: 5, maxR: big ? 72 : 46, life: 1 })
  }, [])

  // ── Start wave ──────────────────────────────────────────────────────────
  const startWave = useCallback(() => {
    const s = stateRef.current
    const cfg = waveConfig(s.wave)
    s.waveCountdown = cfg.count
    s.spawnInterval = cfg.spacing
    s.lastSpawn = -cfg.spacing // spawn first ship immediately
    s.betweenWaves = false
  }, [])

  // ── Show screens ────────────────────────────────────────────────────────
  const showGameOver = useCallback(() => {
    const s = stateRef.current
    if (!gameoverScreenRef.current) return
    gameoverScreenRef.current.querySelector('#go-score').textContent = '🏆 Score: ' + s.score
    gameoverScreenRef.current.querySelector('#go-wave').textContent = `Reached Wave ${s.wave} of ${MAX_WAVE}`
    gameoverScreenRef.current.style.display = 'flex'
  }, [])

  const showWin = useCallback(() => {
    const s = stateRef.current
    if (!winScreenRef.current) return
    winScreenRef.current.querySelector('#win-score').textContent = `🏆 Score: ${s.score}  •  Oil: $${s.oilPrice}`
    winScreenRef.current.style.display = 'flex'
  }, [])

  // ── Start / Reset game ──────────────────────────────────────────────────
  const startGame = useCallback(() => {
    const s = stateRef.current
    Object.assign(s, {
      status: 'playing', score: 0, oilPrice: 40, hp: 5, maxHp: 5, wave: 1,
      ships: [], missiles: [], explosions: [], particles: [],
      ammo: MAX_AMMO, reloadTimer: 0, shakeTime: 0, recentFire: 0,
    })
    if (startScreenRef.current) startScreenRef.current.style.display = 'none'
    if (gameoverScreenRef.current) gameoverScreenRef.current.style.display = 'none'
    if (winScreenRef.current) winScreenRef.current.style.display = 'none'
    startWave()
    updateHUD()
  }, [startWave, updateHUD])

  // ── Canvas click → fire missile ─────────────────────────────────────────
  const handleClick = useCallback((e) => {
    const s = stateRef.current
    if (s.status !== 'playing') return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = W / rect.width
    const scaleY = H / rect.height
    const mx = (e.clientX - rect.left)  * scaleX
    const my = (e.clientY - rect.top)   * scaleY
    if (my > SHORE_TOP && my < SHORE_BOT && s.ammo > 0) {
      s.ammo--
      s.recentFire = 8
      s.missiles.push({
        x: W * 0.5, y: SHORE_BOT - 12,
        origX: W * 0.5, origY: SHORE_BOT - 12,
        tx: mx, ty: my,
        speed: 10, life: 85, trail: [],
      })
      playSound('fire')
      updateHUD()
    }
  }, [updateHUD])

  // ── Main game loop ──────────────────────────────────────────────────────
  const loop = useCallback((t) => {
    const s = stateRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const dt = t - s.lastTime
    s.lastTime = t

    ctx.clearRect(0, 0, W, H)

    if (s.status !== 'playing') {
      drawWater(ctx, t); drawLand(ctx)
      s.rafId = requestAnimationFrame(loop)
      return
    }

    // ── Spawn ships ──
    const cfg = waveConfig(s.wave)
    if (s.waveCountdown > 0 && t - s.lastSpawn > s.spawnInterval) {
      s.ships.push(createShip(cfg))
      s.waveCountdown--
      s.lastSpawn = t
    }

    // ── Wave completion ──
    if (s.waveCountdown === 0 && s.ships.length === 0 && !s.betweenWaves) {
      s.betweenWaves = true
      s.betweenTimer = t
    }
    if (s.betweenWaves && t - s.betweenTimer > 2600) {
      if (s.wave >= MAX_WAVE) {
        s.status = 'win'; showWin()
        s.rafId = requestAnimationFrame(loop)
        return
      }
      s.wave++; s.ammo = MAX_AMMO
      startWave(); updateHUD()
    }

    // ── Move ships ──
    for (let i = s.ships.length - 1; i >= 0; i--) {
      const ship = s.ships[i]
      ship.x += ship.speed
      ship.wobble = (ship.wobble + 0.02) % (Math.PI * 2)
      if (ship.x > W + 70 && !ship.reached) {
        ship.reached = true; s.ships.splice(i, 1)
        s.hp--; s.shakeTime = 500; updateHUD()
        if (s.hp <= 0) { s.status = 'over'; showGameOver(); s.rafId = requestAnimationFrame(loop); return }
      }
    }

    // ── Move missiles + collision ──
    for (let i = s.missiles.length - 1; i >= 0; i--) {
      const m = s.missiles[i]
      m.trail.push({ x: m.x, y: m.y })
      if (m.trail.length > 13) m.trail.shift()
      const dx = m.tx - m.x, dy = m.ty - m.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < m.speed || m.life <= 0) {
        spawnExplosion(m.x, m.y, false)
        s.missiles.splice(i, 1)
        // hit check
        for (let j = s.ships.length - 1; j >= 0; j--) {
          const ship = s.ships[j]
          if (Math.abs(m.tx - ship.x) < ship.width / 2 + 22 && Math.abs(m.ty - ship.y) < ship.height + 22) {
            ship.hp--; playSound('hit')
            if (ship.hp <= 0) {
              spawnExplosion(ship.x, ship.y, ship.trump)
              playSound('boom')
              s.score    += ship.trump ? 500 : 100
              s.oilPrice += ship.trump ? 20  : 5
              s.ships.splice(j, 1)
              updateHUD()
            }
          }
        }
        continue
      }
      m.x += (dx / dist) * m.speed
      m.y += (dy / dist) * m.speed
      m.life--
    }

    // ── Ammo reload ──
    if (s.ammo < MAX_AMMO) {
      s.reloadTimer += dt
      if (s.reloadTimer >= RELOAD_TIME) {
        s.ammo = Math.min(MAX_AMMO, s.ammo + 1)
        s.reloadTimer = 0; updateHUD()
      }
    }

    // ── Particles & explosions ──
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const p = s.particles[i]
      p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= p.decay
      if (p.life <= 0) s.particles.splice(i, 1)
    }
    for (let i = s.explosions.length - 1; i >= 0; i--) {
      const ex = s.explosions[i]
      ex.r += (ex.maxR - ex.r) * 0.15; ex.life -= 0.04
      if (ex.life <= 0) s.explosions.splice(i, 1)
    }
    if (s.recentFire > 0) s.recentFire--

    // ── Draw ──
    if (s.shakeTime > 0) {
      s.shakeTime -= dt
      const sh = 3
      ctx.save()
      ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh)
    }

    drawWater(ctx, t)
    drawLand(ctx)
    for (let i = 0; i < 5; i++) drawBarrel(ctx, 28 + i * 40, SHORE_BOT + 30)
    s.ships.forEach(ship => drawShip(ctx, ship, t))
    s.missiles.forEach(m => drawMissile(ctx, m))
    s.particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.life})`; ctx.fill()
    })
    s.explosions.forEach(ex => {
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,150,30,${ex.life})`; ctx.lineWidth = 3; ctx.stroke()
      ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r * 0.6, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,220,50,${ex.life * 0.5})`; ctx.lineWidth = 2; ctx.stroke()
    })
    drawTurret(ctx, t, s.recentFire)

    // Between-wave banner
    if (s.betweenWaves) {
      const prog = Math.min(1, (t - s.betweenTimer) / 500)
      ctx.fillStyle = `rgba(0,20,40,${0.72 * prog})`
      ctx.fillRect(0, H / 2 - 42, W, 84)
      ctx.fillStyle = `rgba(46,204,113,${prog})`
      ctx.font = 'bold 18px Orbitron, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        s.wave >= MAX_WAVE
          ? '⚡ LAST WAVE CLEARED — VICTORY IMMINENT ⚡'
          : `✅ WAVE ${s.wave} CLEARED — WAVE ${s.wave + 1} INCOMING`,
        W / 2, H / 2 - 6
      )
      ctx.fillStyle = `rgba(255,200,50,${prog})`
      ctx.font = '11px Orbitron, monospace'
      ctx.fillText(`AMMO REFILLED  •  SCORE: ${s.score}  •  OIL: $${s.oilPrice}`, W / 2, H / 2 + 20)
      ctx.textAlign = 'left'
    }

    if (s.shakeTime > 0 || s.shakeTime > -100) ctx.restore?.()

    s.rafId = requestAnimationFrame(loop)
  }, [spawnExplosion, startWave, updateHUD, showGameOver, showWin])

  // ── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    s.rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(s.rafId)
  }, [loop])

  // ── Stars for idle bg (static, set once) ─────────────────────────────────
  // (handled inline in loop for simplicity)

  return (
    <div className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={styles.canvas}
        onClick={handleClick}
      />

      {/* ── HUD ── */}
      <div ref={hudRef} className={styles.hud}>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Oil Price</span>
          <span className={`${styles.hudValue} ${styles.orange}`} id="h-oil">$40</span>
          <div className={styles.barWrap}><div id="h-oil-bar" className={`${styles.bar} ${styles.oilBar}`} /></div>
        </div>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Score</span>
          <span className={styles.hudValue} id="h-score">0</span>
        </div>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Wave</span>
          <span className={`${styles.hudValue} ${styles.red}`} id="h-wave">1/6</span>
        </div>
        <div className={styles.hudBlock}>
          <span className={styles.hudLabel}>Strait HP</span>
          <span className={styles.hudValue} id="h-hp">5</span>
          <div className={styles.barWrap}><div id="h-hp-bar" className={`${styles.bar} ${styles.hpBar}`} /></div>
        </div>
      </div>

      {/* ── Ammo dots ── */}
      <div ref={ammoHudRef} className={styles.ammoHud}>
        {Array.from({ length: MAX_AMMO }).map((_, i) => (
          <div key={i} className={styles.ammoDot} />
        ))}
      </div>
      <div className={styles.tooltip}>CLICK WATER TO FIRE MISSILE</div>

      {/* ── Start screen ── */}
      <div ref={startScreenRef} className={`${styles.overlay} ${styles.startOverlay}`}>
        <h1 className={styles.title}>Lord of<br />the Straits</h1>
        <p className={styles.subtitle}>🛢️ Defend the Strait of Hormuz 🛢️</p>
        <p className={styles.desc}>
          Enemy warships are trying to breach the strait.<br />
          <span>Click</span> the water to fire missiles.<br />
          Each ship sunk <span>raises oil prices</span> — survive all 6 waves!
        </p>
        <button className={styles.btn} onClick={startGame}>DEPLOY FORCES</button>
      </div>

      {/* ── Game Over ── */}
      <div ref={gameoverScreenRef} className={`${styles.overlay} ${styles.gameoverOverlay}`} style={{ display: 'none' }}>
        <h1 className={`${styles.title} ${styles.redTitle}`}>Strait Lost!</h1>
        <p id="go-wave" className={styles.waveFinal} />
        <p id="go-score" className={styles.scoreFinal} />
        <button className={`${styles.btn} ${styles.btnRed}`} onClick={startGame}>RETRY MISSION</button>
      </div>

      {/* ── Win ── */}
      <div ref={winScreenRef} className={`${styles.overlay} ${styles.winOverlay}`} style={{ display: 'none' }}>
        <h1 className={styles.title}>Strait Secured! 🏆</h1>
        <p className={styles.subtitle}>The Hormuz stands!</p>
        <p id="win-score" className={styles.scoreFinal} />
        <button className={styles.btn} onClick={startGame}>PLAY AGAIN</button>
      </div>
    </div>
  )
}
