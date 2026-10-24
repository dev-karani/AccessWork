import { useEffect, useRef } from 'react'

export interface CameraSetting {
  on: boolean
  deviceId: string | undefined
}

export function CameraControl({
  label,
  camera,
  onCamera,
  devices,
}: {
  label: string
  camera: CameraSetting
  onCamera: (c: CameraSetting) => void
  devices: MediaDeviceInfo[]
}) {
  return (
    <div className="camera-control">
      <button className={camera.on ? 'active' : ''} onClick={() => onCamera({ ...camera, on: !camera.on })} aria-pressed={camera.on}>
        {camera.on ? `Turn off ${label}` : `Turn on ${label}`}
      </button>
      {devices.length > 1 && (
        <select
          aria-label={`Choose ${label}`}
          value={camera.deviceId ?? ''}
          onChange={(e) => onCamera({ ...camera, deviceId: e.target.value || undefined })}
        >
          <option value="">Default camera</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function VideoPreview({ stream, className, label }: { stream: MediaStream | null; className?: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    if (stream) ref.current.play().catch(() => {})
  }, [stream])
  if (!stream) return null
  return <video ref={ref} className={className} muted playsInline autoPlay aria-label={label} />
}
