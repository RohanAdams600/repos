/** PUT to the signed URL with progress events (fetch has no upload progress). Abortable. */
export function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.timeout = 10 * 60_000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 400 || xhr.status === 403 ? 'rejected' : 'failed')))
    xhr.onerror = () => reject(new Error('network'))
    xhr.ontimeout = () => reject(new Error('timeout'))
    signal.addEventListener('abort', () => {
      xhr.abort()
      reject(new Error('aborted'))
    })
    xhr.send(file)
  })
}

export const UPLOAD_ERRORS: Record<string, string> = {
  network: 'The upload was interrupted. Check your connection and try again.',
  timeout: 'The upload took too long. Try a shorter clip or a faster connection.',
  rejected: 'Storage rejected the file. It may be larger than declared, or the upload link expired. Start again.',
  failed: 'The upload failed. Try again in a moment.',
  aborted: 'Upload canceled.',
}
