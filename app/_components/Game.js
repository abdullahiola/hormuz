'use client'

import { useEffect, useRef, useCallback } from 'react'
import styles from './Game.module.css'

// ── Constants ──────────────────────────────────────────────────────────────
const W = 900, H = 600
const SHORE_TOP = 130
const SHORE_BOT = 470
const MAX_WAVE = 6
const MAX_AMMO = 10
const RELOAD_TIME = 1400

function waveConfig(w) {
  return {
    count:    4 + w * 3,
    speed:    0.4 + w * 0.13,
    hp:       1 + Math.floor(w / 2),
    spacing:  Math.max(1600, 3400 - w * 280),
  }
}

// ── Sprite loading: strip near-white background on load ──────────────────────
// Returns a canvas with white pixels made transparent.
function processSprite(src, onDone) {
  const img = new Image()
  img.onload = () => {
    const oc = document.createElement('canvas')
    oc.width = img.naturalWidth; oc.height = img.naturalHeight
    const octx = oc.getContext('2d')
    octx.drawImage(img, 0, 0)
    const id = octx.getImageData(0, 0, oc.width, oc.height)
    const d = id.data
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 215 && d[i+1] > 215 && d[i+2] > 215) d[i+3] = 0
    }
    octx.putImageData(id, 0, 0)
    onDone(oc)
  }
  img.src = src
}

let droneImg = null
const shipImgs = { us: null, trump: null, china: null }
if (typeof window !== 'undefined') {
  processSprite('/shahed136.png',  c => { droneImg = c })
  processSprite('/ship_us.png',    c => { shipImgs.us    = c })
  processSprite('/ship_trump.png', c => { shipImgs.trump  = c })
  processSprite('/ship_china.png', c => { shipImgs.china  = c })
}

// ── Audio ───────────────────────────────────────────────────────────────────
let audioCtx = null
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}
function playSound(type) {
  try {
    const ac = getAudio()
    const osc = ac.createOscillator(), gain = ac.createGain()
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
    } else if (type === 'penalty') {
      osc.type = 'square'
      osc.frequency.setValueAtTime(200, ac.currentTime)
      osc.frequency.exponentialRampToValueAtTime(80, ac.currentTime + 0.5)
      gain.gain.setValueAtTime(0.25, ac.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5)
      osc.start(); osc.stop(ac.currentTime + 0.5)
    }
  } catch (_) {}
}

// ── Ship factories ───────────────────────────────────────────────────────────
let shipId = 0

// Enemy nations
const ENEMY_NATIONS = ['usa', 'israel', 'saudi', 'uae']

function createShip(cfg) {
  const trump = Math.random() < 0.18  // Trump flagship variant
  const nation = ENEMY_NATIONS[Math.floor(Math.random() * ENEMY_NATIONS.length)]
  const topY = coastY(IRAN_COAST, 0) + 30
  const botY = coastY(OMAN_COAST, 0) - 30
  return {
    id: shipId++,
    kind: trump ? 'trump' : 'us',
    nation: trump ? 'usa' : nation,
    x: -130,
    y: topY + Math.random() * (botY - topY),
    speed: cfg.speed * (0.78 + Math.random() * 0.44),
    hp: cfg.hp + (trump ? 2 : 0),
    maxHp: cfg.hp + (trump ? 2 : 0),
    width:  trump ? 110 : 78,
    height: trump ? 44  : 32,
    wobble: Math.random() * Math.PI * 2,
    reached: false,
    friendly: false,
  }
}

// Friendly (Chinese) cargo ship — don't shoot!
// Allied nations: ships from these countries have safe passage
const ALLIED_NATIONS = ['iran', 'syria', 'russia', 'china']

function createFriendlyShip() {
  const topY = coastY(IRAN_COAST, 0) + 40
  const botY = coastY(OMAN_COAST, 0) - 50
  const nation = ALLIED_NATIONS[Math.floor(Math.random() * ALLIED_NATIONS.length)]
  return {
    id: shipId++,
    kind: 'china',  // use china sprite for all cargo ships
    nation,
    x: -160,
    y: topY + Math.random() * (botY - topY),
    speed: 0.55 + Math.random() * 0.2,
    hp: 999, maxHp: 999,
    width: 130, height: 46,
    wobble: Math.random() * Math.PI * 2,
    reached: false,
    friendly: true,
    penaltyApplied: false,
  }
}

// ── Flag helpers ─────────────────────────────────────────────────────────────
// Draw a proper US flag (red/white stripes + blue canton)
function drawUSFlag(ctx, x, y, fw, fh) {
  const stripes = 13, sh = fh / stripes
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#B22234' : '#FFFFFF'
    ctx.fillRect(x, y + i * sh, fw, sh)
  }
  const cw = fw * 0.38, ch = fh * (7 / 13)
  ctx.fillStyle = '#3C3B6E'
  ctx.fillRect(x, y, cw, ch)
  // 5 rows of stars (simplified white dots)
  ctx.fillStyle = '#FFFFFF'
  const cols = 6, rows = 5, sx = cw / (cols + 0.5), sy = ch / (rows + 0.5)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.beginPath()
      ctx.arc(x + sx * (c + 0.75), y + sy * (r + 0.75), 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// Draw Iran flag (green/white/red + emblem stripe)
function drawIranFlag(ctx, x, y, fw, fh) {
  const third = fh / 3
  ctx.fillStyle = '#239F40'; ctx.fillRect(x, y, fw, third)
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y + third, fw, third)
  ctx.fillStyle = '#DA0000'; ctx.fillRect(x, y + third * 2, fw, third)
  // Emblem (simplified Allah motif — just a small red circle)
  ctx.fillStyle = '#DA0000'
  ctx.beginPath(); ctx.arc(x + fw / 2, y + fh / 2, fh * 0.15, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.arc(x + fw / 2, y + fh / 2, fh * 0.08, 0, Math.PI * 2); ctx.fill()
  // Takbir script line — simplified dashes at border of green/white and white/red
  ctx.fillStyle = '#DA0000'
  ctx.fillRect(x, y + third - 1, fw, 2)
  ctx.fillStyle = '#239F40'
  ctx.fillRect(x, y + third * 2 - 1, fw, 2)
}

// Draw Chinese flag (red + yellow star)
function drawChinaFlag(ctx, x, y, fw, fh) {
  ctx.fillStyle = '#DE2910'; ctx.fillRect(x, y, fw, fh)
  // Large star
  drawStar(ctx, x + fw * 0.25, y + fh * 0.33, fh * 0.22, '#FFDE00')
  // 4 small stars
  const positions = [[0.5, 0.1], [0.6, 0.22], [0.6, 0.44], [0.5, 0.56]]
  positions.forEach(([sx, sy]) => {
    drawStar(ctx, x + fw * sx, y + fh * sy, fh * 0.1, '#FFDE00')
  })
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.save(); ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2
    const b = a + (2 * Math.PI) / 5
    i === 0
      ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    ctx.lineTo(cx + r * 0.4 * Math.cos(b - Math.PI / 5), cy + r * 0.4 * Math.sin(b - Math.PI / 5))
  }
  ctx.closePath(); ctx.fill(); ctx.restore()
}

function drawSyriaFlag(ctx, x, y, fw, fh) {
  const third = fh / 3
  ctx.fillStyle = '#CE1126'; ctx.fillRect(x, y, fw, third)
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y + third, fw, third)
  ctx.fillStyle = '#000000'; ctx.fillRect(x, y + third * 2, fw, third)
  drawStar(ctx, x + fw * 0.35, y + fh * 0.5, fh * 0.12, '#007A3D')
  drawStar(ctx, x + fw * 0.65, y + fh * 0.5, fh * 0.12, '#007A3D')
}

function drawRussiaFlag(ctx, x, y, fw, fh) {
  const third = fh / 3
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, fw, third)
  ctx.fillStyle = '#0039A6'; ctx.fillRect(x, y + third, fw, third)
  ctx.fillStyle = '#D52B1E'; ctx.fillRect(x, y + third * 2, fw, third)
}

// Israel flag: white + two blue stripes + Star of David
function drawIsraelFlag(ctx, x, y, fw, fh) {
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x, y, fw, fh)
  ctx.fillStyle = '#0038B8'
  ctx.fillRect(x, y + fh * 0.12, fw, fh * 0.1)  // top stripe
  ctx.fillRect(x, y + fh * 0.78, fw, fh * 0.1)  // bottom stripe
  // Star of David (simplified as two overlapping triangles)
  const cx = x + fw / 2, cy = y + fh / 2, r = fh * 0.22
  ctx.strokeStyle = '#0038B8'; ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI / 3) - Math.PI / 2; ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) }
  ctx.closePath(); ctx.stroke()
  ctx.beginPath()
  for (let i = 0; i < 3; i++) { const a = (i * 2 * Math.PI / 3) + Math.PI / 2; ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) }
  ctx.closePath(); ctx.stroke()
}

// Saudi flag: green + white text area + sword
function drawSaudiFlag(ctx, x, y, fw, fh) {
  ctx.fillStyle = '#006C35'; ctx.fillRect(x, y, fw, fh)
  // Simplified shahada text (white rectangle)
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + fw * 0.15, y + fh * 0.2, fw * 0.7, fh * 0.3)
  // Sword line
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x + fw * 0.2, y + fh * 0.7); ctx.lineTo(x + fw * 0.8, y + fh * 0.7); ctx.stroke()
}

// UAE flag: green/white/black vertical + red stripe left
function drawUAEFlag(ctx, x, y, fw, fh) {
  ctx.fillStyle = '#FF0000'; ctx.fillRect(x, y, fw * 0.25, fh)  // red bar
  const third = fh / 3, bx = x + fw * 0.25, bw = fw * 0.75
  ctx.fillStyle = '#00732F'; ctx.fillRect(bx, y, bw, third)
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bx, y + third, bw, third)
  ctx.fillStyle = '#000000'; ctx.fillRect(bx, y + third * 2, bw, third)
}

function drawNationFlag(ctx, nation, x, y, fw, fh) {
  if (nation === 'iran')        drawIranFlag(ctx, x, y, fw, fh)
  else if (nation === 'syria')  drawSyriaFlag(ctx, x, y, fw, fh)
  else if (nation === 'russia') drawRussiaFlag(ctx, x, y, fw, fh)
  else if (nation === 'china')  drawChinaFlag(ctx, x, y, fw, fh)
  else if (nation === 'usa')    drawUSFlag(ctx, x, y, fw, fh)
  else if (nation === 'israel') drawIsraelFlag(ctx, x, y, fw, fh)
  else if (nation === 'saudi')  drawSaudiFlag(ctx, x, y, fw, fh)
  else if (nation === 'uae')    drawUAEFlag(ctx, x, y, fw, fh)
}

const NATION_LABELS = { usa: 'USA', israel: 'ISRAEL', saudi: 'SAUDI', uae: 'UAE' }


// ── Strait of Hormuz coastline data ──────────────────────────────────────────
// Ships travel left→right (Persian Gulf → Gulf of Oman)
// North coast = Iran, South coast = UAE (west) + Musandam/Oman (east bottleneck)
//
// Coordinates are [x, y] pairs on the 900×600 canvas
// The Musandam Peninsula juts UPWARD (lower y) from the south at x≈540-680

const IRAN_COAST = [
  [0,   105],  // northwest — Persian Gulf entry
  [80,  100],
  [160,  98],  // Bandar Abbas region starts
  [260, 108],  // slight indent
  [340, 118],  // coast curves outward slightly
  [420, 112],  // Larak Island area
  [500, 120],  // main coast above strait
  [580, 128],  // above narrowest point
  [660, 122],
  [750, 115],  // coast rises again toward Gulf of Oman
  [830, 108],
  [900, 105],  // exit to Gulf of Oman
]

// South coast: UAE flat plain left, then Musandam jutting up in middle, then Oman coast right
const OMAN_COAST = [
  [0,   520],  // UAE coast — wide Persian Gulf end
  [80,  510],
  [160, 500],  // UAE coastline, relatively flat
  [240, 490],
  [310, 475],  // coast begins curving
  [370, 455],
  [420, 430],  // approaching Musandam
  [460, 400],
  [500, 365],  // Musandam starts jutting north
  [530, 330],  // narrow passage — Musandam tip area
  [555, 295],  // NARROWEST POINT — tip of Musandam
  [580, 310],
  [610, 345],  // past the narrowest, widening
  [650, 385],  // Musandam east face
  [700, 425],
  [750, 455],  // Gulf of Oman opens up
  [820, 475],
  [900, 490],  // Gulf of Oman right side
]

// Interpolate coast Y at a given x
function coastY(coast, x) {
  for (let i = 0; i < coast.length - 1; i++) {
    if (x >= coast[i][0] && x <= coast[i + 1][0]) {
      const t = (x - coast[i][0]) / (coast[i + 1][0] - coast[i][0])
      return coast[i][1] + t * (coast[i + 1][1] - coast[i][1])
    }
  }
  return x < coast[0][0] ? coast[0][1] : coast[coast.length - 1][1]
}

export function northCoastY(x) { return coastY(IRAN_COAST, x) }
export function southCoastY(x) { return coastY(OMAN_COAST, x) }

// Qeshm Island — sits along the Iranian coast in the northern strait
// Large island, long and narrow, oriented roughly E-W from x≈200 to x≈520
const QESHM_POLY = [
  [215, 160], [260, 148], [320, 143], [380, 145],
  [440, 150], [490, 158], [510, 168], [490, 178],
  [440, 182], [380, 180], [320, 177], [260, 172], [215, 168],
]

// Hormuz Island — small island near the narrowest point
const HORMUZ_ISLAND = { x: 585, y: 195, rx: 22, ry: 14 }

// ── Water ─────────────────────────────────────────────────────────────────────
function drawWater(ctx, t) {
  // Fill entire canvas with water first (background)
  const wGrad = ctx.createLinearGradient(0, 0, 0, H)
  wGrad.addColorStop(0,   '#1a6a8a')  // Persian Gulf — slightly lighter blue-green
  wGrad.addColorStop(0.3, '#0e5070')  // main strait
  wGrad.addColorStop(0.7, '#0a3d58')  // deeper
  wGrad.addColorStop(1,   '#1a6a8a')  // Gulf of Oman
  ctx.fillStyle = wGrad
  ctx.fillRect(0, 0, W, H)

  // Clip water to the channel between the two coasts
  ctx.save()
  ctx.beginPath()
  // Draw the water polygon: north coast top→right, then south coast right→left
  ctx.moveTo(IRAN_COAST[0][0], IRAN_COAST[0][1])
  IRAN_COAST.forEach(([x, y]) => ctx.lineTo(x, y))
  // Right edge
  ctx.lineTo(W, OMAN_COAST[OMAN_COAST.length - 1][1])
  // South coast right→left
  for (let i = OMAN_COAST.length - 1; i >= 0; i--) {
    ctx.lineTo(OMAN_COAST[i][0], OMAN_COAST[i][1])
  }
  ctx.closePath()

  // Water channel fill
  const chGrad = ctx.createLinearGradient(0, 100, 0, 550)
  chGrad.addColorStop(0,   '#1b7a9a')
  chGrad.addColorStop(0.4, '#0e5e80')
  chGrad.addColorStop(0.7, '#0a4a68')
  chGrad.addColorStop(1,   '#1a7090')
  ctx.fillStyle = chGrad
  ctx.fill()
  ctx.restore()

  // Animated ripples (clipped to water channel)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(IRAN_COAST[0][0], IRAN_COAST[0][1])
  IRAN_COAST.forEach(([x, y]) => ctx.lineTo(x, y))
  ctx.lineTo(W, OMAN_COAST[OMAN_COAST.length - 1][1])
  for (let i = OMAN_COAST.length - 1; i >= 0; i--) ctx.lineTo(OMAN_COAST[i][0], OMAN_COAST[i][1])
  ctx.closePath()
  ctx.clip()

  ctx.strokeStyle = 'rgba(150,230,255,0.07)'
  ctx.lineWidth = 1
  for (let row = 0; row < 12; row++) {
    const fy = 110 + row * 38
    ctx.beginPath()
    for (let x = 0; x <= W; x += 5) {
      const y = fy + Math.sin(x * 0.018 + t * 0.001 + row * 0.9) * 3
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

// ── Land ──────────────────────────────────────────────────────────────────────
function drawLand(ctx) {
  // ── Iran (north) ──
  const iranGrad = ctx.createLinearGradient(0, 0, 0, 130)
  iranGrad.addColorStop(0, '#5a4020')  // deeper interior color
  iranGrad.addColorStop(1, '#c8a870')  // sandy/tan at coast
  ctx.fillStyle = iranGrad
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(W, 0)
  ctx.lineTo(W, IRAN_COAST[IRAN_COAST.length - 1][1])
  IRAN_COAST.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y))
  ctx.closePath()
  ctx.fill()

  // Rocky ridgeline detail along Iranian coast
  ctx.fillStyle = 'rgba(90,60,20,0.5)'
  for (let i = 0; i < 12; i++) {
    ctx.beginPath()
    const bx = 30 + i * 78
    const by = coastY(IRAN_COAST, bx)
    ctx.ellipse(bx, by - 12, 36 + Math.sin(i * 1.3) * 10, 18 + Math.cos(i * 0.9) * 6, 0, 0, Math.PI)
    ctx.fill()
  }

  // ── UAE / Oman / Musandam (south) ──
  const omanGrad = ctx.createLinearGradient(0, 490, 0, H)
  omanGrad.addColorStop(0, '#d4a860')   // sandy coast
  omanGrad.addColorStop(0.5, '#a07030') // drier interior
  omanGrad.addColorStop(1,   '#6a4820') // deep interior
  ctx.fillStyle = omanGrad
  ctx.beginPath()
  OMAN_COAST.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.lineTo(W, H)
  ctx.lineTo(0, H)
  ctx.closePath()
  ctx.fill()

  // Mountain ridges for Musandam Peninsula (rugged, fjord-like)
  ctx.fillStyle = 'rgba(80,50,15,0.55)'
  // The rocky Hajar mountains of Musandam
  const musandamX = 555  // narrowest tip x
  const musandamY = coastY(OMAN_COAST, musandamX)
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    const mx = musandamX + i * 28
    const my = coastY(OMAN_COAST, mx)
    ctx.ellipse(mx, my + 14, 22 + Math.abs(Math.sin(i * 0.8)) * 8, 20 + Math.cos(i) * 5, 0, Math.PI, Math.PI * 2)
    ctx.fill()
  }
  // UAE flat desert dunes
  ctx.fillStyle = 'rgba(160,120,50,0.3)'
  for (let i = 0; i < 5; i++) {
    ctx.beginPath()
    const dx = 60 + i * 90
    const dy = coastY(OMAN_COAST, dx)
    ctx.ellipse(dx, dy + 20, 55, 18, 0, Math.PI, Math.PI * 2)
    ctx.fill()
  }

  // ── Qeshm Island (Iran, largest island) ──
  const qGrad = ctx.createLinearGradient(215, 145, 510, 180)
  qGrad.addColorStop(0, '#c4a460')
  qGrad.addColorStop(1, '#a08040')
  ctx.fillStyle = qGrad
  ctx.beginPath()
  QESHM_POLY.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(200,160,80,0.6)'; ctx.lineWidth = 1.5; ctx.stroke()
  // Qeshm label
  ctx.fillStyle = 'rgba(255,220,140,0.6)'; ctx.font = '9px Orbitron, monospace'
  ctx.textAlign = 'center'; ctx.fillText('QESHM', 360, 167); ctx.textAlign = 'left'

  // ── Hormuz Island (small, near narrowest point) ──
  ctx.fillStyle = '#b89040'
  ctx.beginPath()
  ctx.ellipse(HORMUZ_ISLAND.x, HORMUZ_ISLAND.y, HORMUZ_ISLAND.rx, HORMUZ_ISLAND.ry, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,220,140,0.5)'; ctx.font = '8px Orbitron, monospace'
  ctx.textAlign = 'center'; ctx.fillText('HORMUZ I.', HORMUZ_ISLAND.x, HORMUZ_ISLAND.y - 18); ctx.textAlign = 'left'

  // ── Country labels ──
  ctx.fillStyle = 'rgba(255,240,200,0.75)'; ctx.font = 'bold 14px Orbitron, monospace'
  ctx.fillText('🇮🇷  I R A N', 30, 70)

  ctx.fillStyle = 'rgba(255,240,200,0.6)'; ctx.font = 'bold 10px Orbitron, monospace'
  ctx.fillText('🇦🇪 UAE', 30, 565)
  ctx.fillText('🇴🇲 OMAN', 680, 565)

  // Musandam label
  ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.font = '8px Orbitron, monospace'
  ctx.textAlign = 'center'; ctx.fillText('MUSANDAM', 555, musandamY + 30); ctx.textAlign = 'left'

  // Strait label in the water channel
  ctx.fillStyle = 'rgba(200,240,255,0.25)'; ctx.font = 'bold 11px Orbitron, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('— STRAIT OF HORMUZ —', 460, 270)
  // Direction arrows
  ctx.fillStyle = 'rgba(200,240,255,0.15)'; ctx.font = '9px Orbitron, monospace'
  ctx.fillText('PERSIAN GULF ←', 180, 300)
  ctx.fillText('→ GULF OF OMAN', 680, 300)
  ctx.textAlign = 'left'
}

// ── Shahed-136 drone — fixed at top-right, facing left (toward incoming ships) ──
function drawIranianF14(ctx, t, recentFire) {
  // Fixed position: top-right of the map, anchored on the Iranian coast
  const ax = 820 + Math.sin(t * 0.0008) * 30  // subtle forward/backward hover
  const ay = coastY(IRAN_COAST, 820) + 22

  const dw = 110, dh = 82

  ctx.save()
  ctx.translate(ax, ay)

  if (recentFire > 0) {
    ctx.shadowColor = '#f39c12'
    ctx.shadowBlur  = 16 * (recentFire / 10)
  }

  if (droneImg) {
    ctx.drawImage(droneImg, -dw / 2, -dh / 2, dw, dh)
  } else {
    ctx.fillStyle = '#8fbc8f'
    ctx.beginPath()
    ctx.moveTo(40, 0); ctx.lineTo(-40, -32); ctx.lineTo(-20, 0); ctx.lineTo(-40, 32)
    ctx.closePath(); ctx.fill()
  }

  ctx.shadowBlur = 0
  ctx.restore()

  // Label
  ctx.save()
  ctx.translate(ax, ay - 48)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(46,204,113,0.8)'
  ctx.font = 'bold 8px Orbitron, monospace'
  ctx.fillText('SHAHED-136', 0, 0)
  ctx.restore()
}

// ── Draw enemy ships ─────────────────────────────────────────────────────────
// ── Channel centerline: midpoint of water at each x ─────────────────────────
// Ships steer toward this Y each frame to follow the water
function channelCenterY(x) {
  const n = coastY(IRAN_COAST, x)
  const s = coastY(OMAN_COAST, x)
  return (n + s) / 2
}

function drawShip(ctx, s, t) {
  const img  = shipImgs[s.kind]
  const wobble = Math.sin(t * 0.002 + s.wobble) * 2

  // Draw angle: ships tilt slightly based on steering rate
  const angle = s.steerAngle || 0

  ctx.save()
  ctx.translate(s.x, s.y + wobble)
  ctx.rotate(angle)

  // Shorter ships: use 1.1x width, 1.4x height (was 2.2 / 2.5)
  const dw = s.width * 1.1
  const dh = s.height * 1.4

  if (img) {
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  } else {
    // Fallback canvas shapes while image loads
    ctx.fillStyle = s.kind === 'trump' ? '#8B1A1A' : s.kind === 'china' ? '#e07b39' : '#556677'
    ctx.beginPath()
    const W2 = s.width / 2, H2 = s.height / 2
    ctx.moveTo(-W2, 0)
    ctx.quadraticCurveTo(-W2, -H2, 0, -H2)
    ctx.quadraticCurveTo(W2, -H2, W2, 0)
    ctx.quadraticCurveTo(W2, H2, 0, H2)
    ctx.quadraticCurveTo(-W2, H2, -W2, 0)
    ctx.fill()
  }

  ctx.textAlign = 'left'

  // HP bar + flag for enemies
  if (!s.friendly) {
    const hpRatio = s.hp / s.maxHp
    const barW = s.width * 0.9, barX = -barW / 2
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX, s.height + 2, barW, 5)
    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f39c12' : '#e74c3c'
    ctx.fillRect(barX, s.height + 2, barW * hpRatio, 5)
    // Enemy flag above ship
    const efW = 22, efH = 14
    drawNationFlag(ctx, s.nation || 'usa', -efW / 2, -s.height - efH - 4, efW, efH)
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, -s.height / 2); ctx.lineTo(0, -s.height - efH - 4); ctx.stroke()
    // Nation label
    ctx.fillStyle = s.kind === 'trump' ? '#FFD700' : 'rgba(255,200,200,0.8)'
    ctx.font = 'bold 7px Orbitron'; ctx.textAlign = 'center'
    ctx.fillText(s.kind === 'trump' ? 'TRUMP' : (NATION_LABELS[s.nation] || 'USA'), 0, s.height + 14)
  } else {
    // Friendly ship: draw nation flag above
    const flagW = 28, flagH = 18
    drawNationFlag(ctx, s.nation || 'china', -flagW / 2, -s.height - flagH - 6, flagW, flagH)
    // Flagpole line
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, -s.height / 2); ctx.lineTo(0, -s.height - flagH - 6); ctx.stroke()
    // Nation label
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 7px Orbitron'
    ctx.textAlign = 'center'
    ctx.fillText((s.nation || 'CHINA').toUpperCase(), 0, s.height / 2 + 14)
  }

  ctx.restore()
}

function drawMissile(ctx, m) {
  for (let i = 0; i < m.trail.length; i++) {
    const alpha = (i / m.trail.length) * 0.55
    ctx.beginPath(); ctx.arc(m.trail[i].x, m.trail[i].y, 2, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,150,0,${alpha})`; ctx.fill()
  }
  ctx.save(); ctx.translate(m.x, m.y)
  const angle = Math.atan2(m.ty - m.origY, m.tx - m.origX)
  ctx.rotate(angle)
  ctx.fillStyle = '#f39c12'
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#e74c3c'
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(13, 0); ctx.lineTo(7, 5); ctx.closePath(); ctx.fill()
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

// ── Penalty flash overlay ────────────────────────────────────────────────────
function drawPenaltyFlash(ctx, alpha) {
  ctx.fillStyle = `rgba(255,0,200,${alpha})`
  ctx.fillRect(0, 0, W, H)
}

// ── React component ──────────────────────────────────────────────────────────
export default function Game() {
  const canvasRef     = useRef(null)
  const wrapperRef    = useRef(null)
  const stateRef      = useRef({
    status:         'idle',
    score:          0,
    oilPrice:       40,
    hp:             5,
    maxHp:          5,
    wave:           1,
    ships:          [],
    missiles:       [],
    explosions:     [],
    particles:      [],
    ammo:           MAX_AMMO,
    reloadTimer:    0,
    waveCountdown:  0,
    spawnInterval:  0,
    lastSpawn:      -9999,
    chinaTimer:     0,    // countdown until next Chinese ship
    betweenWaves:   false,
    betweenTimer:   0,
    shakeTime:      0,
    recentFire:     0,
    penaltyFlash:   0,    // countdown for pink flash when China ship is hit
    rafId:          null,
    lastTime:       0,
  })
  const hudRef          = useRef(null)
  const ammoHudRef      = useRef(null)
  const startScreenRef  = useRef(null)
  const gameoverRef     = useRef(null)
  const winScreenRef    = useRef(null)

  const updateHUD = useCallback(() => {
    const s = stateRef.current
    if (!hudRef.current) return
    hudRef.current.querySelector('#h-score').textContent = s.score
    hudRef.current.querySelector('#h-oil').textContent   = '$' + s.oilPrice
    hudRef.current.querySelector('#h-wave').textContent  = s.wave + '/' + MAX_WAVE
    hudRef.current.querySelector('#h-hp').textContent    = s.hp
    hudRef.current.querySelector('#h-oil-bar').style.width = Math.min(100, (s.oilPrice - 40) / 160 * 100) + '%'
    hudRef.current.querySelector('#h-hp-bar').style.width  = (s.hp / s.maxHp * 100) + '%'
    if (!ammoHudRef.current) return
    ammoHudRef.current.querySelectorAll('.' + styles.ammoDot).forEach((d, i) =>
      d.classList.toggle(styles.used, i >= s.ammo)
    )
  }, [])

  const spawnExplosion = useCallback((x, y, big) => {
    const s = stateRef.current
    for (let i = 0; i < (big ? 32 : 20); i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * (big ? 4 : 2.5) + 1
      s.particles.push({
        x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: 1, decay: 0.02 + Math.random() * 0.03,
        r: 220 + Math.floor(Math.random() * 20), g: 80 + Math.floor(Math.random() * 140), b: 20,
        size: Math.random() * (big ? 5 : 3) + 1,
      })
    }
    s.explosions.push({ x, y, r: 5, maxR: big ? 72 : 46, life: 1 })
  }, [])

  const startWave = useCallback(() => {
    const s = stateRef.current
    const cfg = waveConfig(s.wave)
    s.waveCountdown = cfg.count
    s.spawnInterval = cfg.spacing
    s.lastSpawn     = -cfg.spacing
    s.betweenWaves  = false
    s.chinaTimer    = 8000 + Math.random() * 6000 // first Chinese ship after 8-14s
  }, [])

  const showGameOver = useCallback(() => {
    const s = stateRef.current
    if (!gameoverRef.current) return
    gameoverRef.current.querySelector('#go-score').textContent = '🏆 Score: ' + s.score
    gameoverRef.current.querySelector('#go-wave').textContent  = `Reached Wave ${s.wave} of ${MAX_WAVE}`
    gameoverRef.current.style.display = 'flex'
  }, [])

  const showWin = useCallback(() => {
    const s = stateRef.current
    if (!winScreenRef.current) return
    winScreenRef.current.querySelector('#win-score').textContent = `🏆 Score: ${s.score}  •  Oil: $${s.oilPrice}`
    winScreenRef.current.style.display = 'flex'
  }, [])

  const startGame = useCallback(() => {
    const s = stateRef.current
    Object.assign(s, {
      status: 'playing', score: 0, oilPrice: 40, hp: 5, maxHp: 5, wave: 1,
      ships: [], missiles: [], explosions: [], particles: [],
      ammo: MAX_AMMO, reloadTimer: 0, shakeTime: 0, recentFire: 0, penaltyFlash: 0,
    })
    if (startScreenRef.current) startScreenRef.current.style.display = 'none'
    if (gameoverRef.current)    gameoverRef.current.style.display    = 'none'
    if (winScreenRef.current)   winScreenRef.current.style.display   = 'none'
    startWave(); updateHUD()
  }, [startWave, updateHUD])

  const handleClick = useCallback((e) => {
    const s = stateRef.current
    if (s.status !== 'playing') return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width)
    const my = (e.clientY - rect.top)  * (H / rect.height)
    // Click is valid if it's within the water channel at that x position
    const northY = coastY(IRAN_COAST, mx)
    const southY = coastY(OMAN_COAST, mx)
    const iranCenterY = coastY(IRAN_COAST, W / 2)
    if (my > northY && my < southY && s.ammo > 0) {
      s.ammo--; s.recentFire = 8
      s.missiles.push({
        x: 820, y: coastY(IRAN_COAST, 820) + 22,
        origX: 820, origY: coastY(IRAN_COAST, 820) + 22,
        tx: mx, ty: my, speed: 10, life: 85, trail: [],
      })
      playSound('fire'); updateHUD()
    }
  }, [updateHUD])

  // Touch handler — delegates to click logic
  const handleTouch = useCallback((e) => {
    e.preventDefault()
    const touch = e.touches[0] || e.changedTouches[0]
    if (!touch) return
    handleClick({ clientX: touch.clientX, clientY: touch.clientY })
  }, [handleClick])

  const loop = useCallback((t) => {
    const s = stateRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dt = t - s.lastTime; s.lastTime = t
    ctx.clearRect(0, 0, W, H)

    if (s.status !== 'playing') {
      drawWater(ctx, t); drawLand(ctx)
      s.rafId = requestAnimationFrame(loop); return
    }

    // ── Spawn enemy ships ──
    if (s.waveCountdown > 0 && t - s.lastSpawn > s.spawnInterval) {
      s.ships.push(createShip(waveConfig(s.wave)))
      s.waveCountdown--; s.lastSpawn = t
    }

    // ── Spawn Chinese ships (independent of wave) ──
    s.chinaTimer -= dt
    if (s.chinaTimer <= 0) {
      s.ships.push(createFriendlyShip())
      s.chinaTimer = 14000 + Math.random() * 10000 // next one in 14-24s
    }

    // ── Wave completion check (only count non-friendly ships) ──
    const enemyCount = s.ships.filter(sh => !sh.friendly).length
    if (s.waveCountdown === 0 && enemyCount === 0 && !s.betweenWaves) {
      s.betweenWaves = true; s.betweenTimer = t
    }
    if (s.betweenWaves && t - s.betweenTimer > 2600) {
      if (s.wave >= MAX_WAVE) { s.status = 'win'; showWin(); s.rafId = requestAnimationFrame(loop); return }
      s.wave++; s.ammo = MAX_AMMO; startWave(); updateHUD()
    }

    // ── Move ships ──
    for (let i = s.ships.length - 1; i >= 0; i--) {
      const ship = s.ships[i]
      ship.x += ship.speed
      ship.wobble = (ship.wobble + 0.02) % (Math.PI * 2)

      // ── Channel steering: follow the water, avoid land ──
      if (ship.x > 0) {
        const target  = channelCenterY(ship.x)
        const prevY   = ship.y
        ship.y += (target - ship.y) * 0.012   // gentle lerp toward center
        // Hard clamp to water boundaries + margin so ships never clip into sand
        const margin  = ship.height / 2 + 8
        const minY    = coastY(IRAN_COAST, ship.x) + margin
        const maxY    = coastY(OMAN_COAST, ship.x) - margin
        ship.y        = Math.max(minY, Math.min(maxY, ship.y))
        // Compute a heading angle for slight visual tilt (capped at ±0.25 rad)
        ship.steerAngle = Math.max(-0.25, Math.min(0.25, (ship.y - prevY) * 0.15))
      }
      if (ship.x > W + 80 && !ship.reached) {
        ship.reached = true; s.ships.splice(i, 1)
        if (!ship.friendly) { // only lose HP if enemy passes
          s.hp--; s.shakeTime = 500; updateHUD()
          if (s.hp <= 0) { s.status = 'over'; showGameOver(); s.rafId = requestAnimationFrame(loop); return }
        }
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
        for (let j = s.ships.length - 1; j >= 0; j--) {
          const ship = s.ships[j]
          if (Math.abs(m.tx - ship.x) < ship.width / 2 + 22 && Math.abs(m.ty - ship.y) < ship.height + 22) {
            if (ship.friendly) {
              // Penalty for hitting allied ship — lose HP!
              if (!ship.penaltyApplied) {
                ship.penaltyApplied = true
                s.hp--
                s.shakeTime = 500
                s.penaltyFlash = 25
                playSound('penalty')
                updateHUD()
                if (s.hp <= 0) { s.status = 'over'; showGameOver(); s.rafId = requestAnimationFrame(loop); return }
              }
            } else {
              ship.hp--; playSound('hit')
              if (ship.hp <= 0) {
                spawnExplosion(ship.x, ship.y, ship.kind === 'trump')
                playSound('boom')
                s.score    += ship.kind === 'trump' ? 500 : 100
                s.oilPrice += ship.kind === 'trump' ? 20  : 5
                s.ships.splice(j, 1); updateHUD()
              }
            }
          }
        }
        continue
      }
      m.x += (dx / dist) * m.speed; m.y += (dy / dist) * m.speed; m.life--
    }

    // ── Ammo reload ──
    if (s.ammo < MAX_AMMO) {
      s.reloadTimer += dt
      if (s.reloadTimer >= RELOAD_TIME) { s.ammo = Math.min(MAX_AMMO, s.ammo + 1); s.reloadTimer = 0; updateHUD() }
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
    if (s.penaltyFlash > 0) s.penaltyFlash--

    // ── Draw ──
    if (s.shakeTime > 0) {
      s.shakeTime -= dt; ctx.save()
      ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3)
    }

    drawWater(ctx, t)
    drawLand(ctx)
    // Oil barrels along Iran coast
    for (let i = 0; i < 6; i++) {
      const bx = 20 + i * 45
      drawBarrel(ctx, bx, coastY(IRAN_COAST, bx) + 18)
    }

    // Draw friendly ships first (under enemies)
    s.ships.filter(sh => sh.friendly).forEach(sh => drawShip(ctx, sh, t))
    s.ships.filter(sh => !sh.friendly).forEach(sh => drawShip(ctx, sh, t))

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

    // Draw Iranian F-14 (replaces old turret)
    drawIranianF14(ctx, t, s.recentFire)

    // Penalty flash when China ship hit
    if (s.penaltyFlash > 0) drawPenaltyFlash(ctx, (s.penaltyFlash / 25) * 0.35)

    // Between-wave banner
    if (s.betweenWaves) {
      const prog = Math.min(1, (t - s.betweenTimer) / 500)
      ctx.fillStyle = `rgba(0,20,40,${0.72 * prog})`; ctx.fillRect(0, H / 2 - 42, W, 84)
      ctx.fillStyle = `rgba(46,204,113,${prog})`; ctx.font = 'bold 18px Orbitron, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(
        s.wave >= MAX_WAVE ? '⚡ LAST WAVE CLEARED — VICTORY IMMINENT ⚡'
                           : `✅ WAVE ${s.wave} CLEARED — WAVE ${s.wave + 1} INCOMING`,
        W / 2, H / 2 - 6
      )
      ctx.fillStyle = `rgba(255,200,50,${prog})`; ctx.font = '11px Orbitron, monospace'
      ctx.fillText(`AMMO REFILLED  •  SCORE: ${s.score}  •  OIL: $${s.oilPrice}`, W / 2, H / 2 + 20)
      ctx.textAlign = 'left'
    }

    if (s.shakeTime > 0 || s.shakeTime > -100) ctx.restore?.()

    s.rafId = requestAnimationFrame(loop)
  }, [spawnExplosion, startWave, updateHUD, showGameOver, showWin])

  // Scale the 900×600 wrapper to fit any screen size
  useEffect(() => {
    function applyScale() {
      const el = wrapperRef.current
      if (!el) return
      const scale = Math.min(window.innerWidth / 900, window.innerHeight / 600, 1)
      el.style.transform = `scale(${scale})`
    }
    applyScale()
    window.addEventListener('resize', applyScale)
    return () => window.removeEventListener('resize', applyScale)
  }, [])

  useEffect(() => {
    const s = stateRef.current
    s.rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(s.rafId)
  }, [loop])

  return (
    <div className={styles.container}>
    <div ref={wrapperRef} className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        width={W} height={H}
        className={styles.canvas}
        onClick={handleClick}
        onTouchStart={handleTouch}
      />

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

      <div ref={ammoHudRef} className={styles.ammoHud}>
        {Array.from({ length: MAX_AMMO }).map((_, i) => (
          <div key={i} className={styles.ammoDot} />
        ))}
      </div>
      <div className={styles.tooltip}>🇮🇷 CLICK WATER TO FIRE  •  🇨🇳 CHINA = SAFE PASSAGE  •  -200pts PENALTY</div>

      {/* Start */}
      <div ref={startScreenRef} className={`${styles.overlay} ${styles.startOverlay}`}>
        <h1 className={styles.title}>Lord of<br />the Straits</h1>
        <p className={styles.subtitle}>🛢️ Defend the Strait of Hormuz 🛢️</p>
        <p className={styles.desc}>
          The IRIAF F-14 patrols overhead — <span>click the water</span> to fire missiles.<br />
          Sink US warships (<span>+100 pts</span>) and Trump flagships (<span>+500 pts</span>).<br />
          🇨🇳 <span style={{color:'#2ecc71'}}>Chinese cargo ships have safe passage</span> — do NOT fire on them!<br />
          Survive all 6 waves to secure the strait.
        </p>
        <button className={styles.btn} onClick={startGame}>DEPLOY F-14</button>
      </div>

      {/* Game Over */}
      <div ref={gameoverRef} className={`${styles.overlay} ${styles.gameoverOverlay}`} style={{ display: 'none' }}>
        <h1 className={`${styles.title} ${styles.redTitle}`}>Strait Lost!</h1>
        <p id="go-wave" className={styles.waveFinal} />
        <p id="go-score" className={styles.scoreFinal} />
        <button className={`${styles.btn} ${styles.btnRed}`} onClick={startGame}>RETRY MISSION</button>
      </div>

      {/* Win */}
      <div ref={winScreenRef} className={`${styles.overlay} ${styles.winOverlay}`} style={{ display: 'none' }}>
        <h1 className={styles.title}>Strait Secured! 🏆</h1>
        <p className={styles.subtitle}>The Hormuz stands!</p>
        <p id="win-score" className={styles.scoreFinal} />
        <button className={styles.btn} onClick={startGame}>PLAY AGAIN</button>
      </div>
    </div>
    </div>
  )
}
