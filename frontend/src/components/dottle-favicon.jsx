'use client'
import { useEffect } from 'react'

export default function DottleFavicon() {
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')

    let blinkState = 1
    let blinkProgress = 0
    let isBlinking = false
    let nextBlink = 3000 + Math.random() * 2000
    let lastTime = 0
    let isSleeping = false

    const setFavicon = () => {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = canvas.toDataURL()
    }

    const drawFace = (eyeScaleY, sleeping) => {
      ctx.clearRect(0, 0, 64, 64)

      // Head
      ctx.beginPath()
      ctx.arc(32, 32, 28, 0, Math.PI * 2)
      ctx.fillStyle = '#C8613A'
      ctx.fill()

      // Head shadow blob
      ctx.beginPath()
      ctx.arc(28, 28, 16, 0, Math.PI * 2)
      ctx.fillStyle = '#B8542F'
      ctx.fill()

      // Antenna stem
      ctx.beginPath()
      ctx.moveTo(32, 10)
      ctx.lineTo(32, 4)
      ctx.strokeStyle = '#C8613A'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.stroke()

      // Antenna tip dot
      ctx.beginPath()
      ctx.arc(32, 3, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#C8613A'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(32, 3, 1.8, 0, Math.PI * 2)
      ctx.fillStyle = '#FFF5F0'
      ctx.fill()

      if (sleeping) {
        // Sleeping eyes — horizontal lines
        ctx.strokeStyle = '#1A1917'
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(20, 30)
        ctx.lineTo(28, 30)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(36, 29)
        ctx.lineTo(44, 29)
        ctx.stroke()
        // Neutral mouth
        ctx.beginPath()
        ctx.arc(32, 38, 5, 0.2, Math.PI - 0.2)
        ctx.strokeStyle = '#1A1917'
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        // Left eye
        ctx.save()
        ctx.translate(24, 30)
        ctx.scale(1, eyeScaleY)
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#FFF5F0'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(1, 1, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#1A1917'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(2, 0, 1, 0, Math.PI * 2)
        ctx.fillStyle = 'white'
        ctx.fill()
        ctx.restore()

        // Right eye
        ctx.save()
        ctx.translate(40, 29)
        ctx.scale(1, eyeScaleY)
        ctx.beginPath()
        ctx.arc(0, 0, 6, 0, Math.PI * 2)
        ctx.fillStyle = '#FFF5F0'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(1, 1, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#1A1917'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(2, 0, 1, 0, Math.PI * 2)
        ctx.fillStyle = 'white'
        ctx.fill()
        ctx.restore()

        // Smile
        ctx.beginPath()
        ctx.arc(32, 36, 6, 0.3, Math.PI - 0.3)
        ctx.strokeStyle = '#1A1917'
        ctx.lineWidth = 1.8
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      setFavicon()
    }

    const handleVisibility = () => {
      isSleeping = document.hidden
    }
    document.addEventListener('visibilitychange', handleVisibility)

    let animFrame
    const tick = (time) => {
      const delta = time - lastTime
      lastTime = time
      isSleeping = document.hidden

      if (isSleeping) {
        drawFace(0.12, true)
      } else {
        nextBlink -= delta
        if (nextBlink <= 0 && !isBlinking) {
          isBlinking = true
          blinkProgress = 0
        }
        if (isBlinking) {
          blinkProgress += delta / 80
          if (blinkProgress < 1) {
            blinkState = Math.max(0.08, 1 - blinkProgress)
          } else if (blinkProgress < 2) {
            blinkState = Math.min(1, blinkProgress - 1)
          } else {
            isBlinking = false
            blinkState = 1
            nextBlink = 3000 + Math.random() * 2500
          }
        }
        drawFace(blinkState, false)
      }

      animFrame = requestAnimationFrame(tick)
    }

    animFrame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animFrame)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return null
}
