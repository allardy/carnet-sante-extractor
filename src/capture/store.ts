export type CapturedResponse = {
  url: string
  status: number
  method: string
  contentType: string
  file: string
}

export type CaptureStore = {
  json: CapturedResponse[]
  binaries: CapturedResponse[]
}
