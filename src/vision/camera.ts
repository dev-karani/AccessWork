import { useCallback, useEffect, useState } from 'react'

/** List cameras. Labels only appear after the user has granted camera permission once. */
export function useCameraDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const all = await navigator.mediaDevices.enumerateDevices()
    setDevices(all.filter((d) => d.kind === 'videoinput'))
  }, [])

  useEffect(() => {
    // Loading the device list is a subscription to an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
  }, [refresh])

  return { devices, refresh }
}

/** Open a camera stream while `enabled` is true. Returns the stream and any error message. */
export function useCamera(enabled: boolean, deviceId: string | undefined, onOpened?: () => void) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let opened: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: deviceId ? undefined : 'user',
        },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        const track = s.getVideoTracks()[0]
        if (!track || track.readyState !== 'live') {
          s.getTracks().forEach((t) => t.stop())
          setError('The camera opened, but no live video track was found. Try another camera.')
          return
        }
        track.enabled = true
        opened = s
        setStream(s)
        setError(null)
        onOpened?.()
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const name = e instanceof DOMException ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'That camera was not found.'
              : name === 'NotReadableError'
                ? 'The camera is busy in another app.'
                : 'The camera needs a secure page (localhost or HTTPS).',
        )
      })
    return () => {
      cancelled = true
      opened?.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
    // onOpened is a notification only; reopening the camera when it changes is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, deviceId])

  return { stream: enabled ? stream : null, error: enabled ? error : null }
}
