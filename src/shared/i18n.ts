export type Locale = 'fr' | 'en'

type S = {
  extractButton: string
  extractingButton: string
  extractAgainButton: string
  tryAgainButton: string
  outputButton: string
  debugTitle: string
  initialStep: string
  startingStep: string
  normalizingStep: string
  writingStep: string
  doneStep: string
  collectingStep: (domain: string, done: number, total: number, sub: string) => string
  errorStep: (err: string) => string
  captureRunningStep: (json: number, pdfs: number, tail: string) => string
  captureDoneStep: (json: number, pdfs: number, tail: string) => string
  domainName: (key: string) => string
}

const prettyFallback = (key: string): string => key.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const domainNames: Record<Locale, Record<string, string>> = {
  fr: {
    profile: 'Profil',
    medications: 'Médicaments',
    appointments: 'Rendez-vous',
    imaging: 'Imagerie',
    labs: 'Analyses',
    'medical-services': 'Services médicaux',
    access: "Journal d'accès",
    documents: 'Documents',
  },
  en: {
    profile: 'Profile',
    medications: 'Medications',
    appointments: 'Appointments',
    imaging: 'Imaging',
    labs: 'Labs',
    'medical-services': 'Medical services',
    access: 'Access log',
    documents: 'Documents',
  },
}

export const strings: Record<Locale, S> = {
  fr: {
    extractButton: 'Extraire mon dossier de santé',
    extractingButton: 'Extraction…',
    extractAgainButton: 'Extraire à nouveau',
    tryAgainButton: 'Réessayer',
    outputButton: 'Dossier de sortie',
    debugTitle: 'Outils de débogage',
    initialStep: 'Connectez-vous à Carnet Santé ci-dessous, puis cliquez sur Extraire.',
    startingStep: 'Démarrage…',
    normalizingStep: 'Normalisation des dossiers…',
    writingStep: 'Écriture du Markdown, JSON et PDFs…',
    doneStep: 'Terminé — votre dossier de santé est prêt. Ouvrez le dossier de sortie.',
    collectingStep: (domain, done, total, sub) => `Collecte — ${domain} (${done}/${total})${sub}`,
    errorStep: (err) => `Erreur : ${err}`,
    captureRunningStep: (json, pdfs, tail) => `Capture — ${json} JSON, ${pdfs} PDF${tail}…`,
    captureDoneStep: (json, pdfs, tail) => `Capture sauvegardée — ${json} JSON, ${pdfs} PDF${tail}.`,
    domainName: (key) => domainNames.fr[key] ?? prettyFallback(key),
  },
  en: {
    extractButton: 'Extract my health record',
    extractingButton: 'Extracting…',
    extractAgainButton: 'Extract again',
    tryAgainButton: 'Try again',
    outputButton: 'Output folder',
    debugTitle: 'Debugging tools',
    initialStep: 'Log in to Carnet Santé below, then click Extract.',
    startingStep: 'Starting…',
    normalizingStep: 'Normalizing records…',
    writingStep: 'Writing Markdown, JSON & PDFs…',
    doneStep: 'Done — your health record is ready. Open the output folder.',
    collectingStep: (domain, done, total, sub) => `Collecting — ${domain} (${done}/${total})${sub}`,
    errorStep: (err) => `Error: ${err}`,
    captureRunningStep: (json, pdfs, tail) => `Capturing — ${json} JSON, ${pdfs} PDF${tail}…`,
    captureDoneStep: (json, pdfs, tail) => `Capture saved — ${json} JSON, ${pdfs} PDF${tail}.`,
    domainName: (key) => domainNames.en[key] ?? prettyFallback(key),
  },
}
