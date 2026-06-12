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
  partialDoneStep: (failed: string) => string
  collectingStep: (domain: string, done: number, total: number, sub: string) => string
  errorStep: (err: string) => string
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

export type DocStrings = {
  none: string
  fullData: string
  jsonLink: string
  backToReadme: string
  entryCount: (n: number) => string
  // profile
  name: string
  citizenId: string
  sex: string
  birthDate: string
  healthCard: string
  expires: string
  email: string
  phone: string
  address: string
  familyDoctor: string
  // medications
  activeRefills: string
  completed: string
  unknownDrug: string
  din: string
  posology: string
  prescriber: string
  pharmacy: string
  prescribed: string
  days: string
  refills: string
  remaining: string
  lastDispensed: string
  // imaging / labs shared
  reportN: (n: number) => string
  test: string
  value: string
  reference: string
  // access
  whoAccessed: string
  person: string
  role: string
  accesses: string
  first: string
  last: string
  accessLog: string
  accessSummary: (events: number, people: number) => string
  domainImaging: string
  domainMedications: string
  domainLabs: string
  // readme
  generatedFor: (name: string, citizen: string, date: string) => string
  whatsInside: string
  legendDocuments: string
  legendDonnees: string
  legendCapture: string
  legendDossier: string
  section: string
  count: string
  documentsCount: (n: number) => string
  // dossier-complet.html chrome
  recordTitle: string
  search: string
  expandAll: string
  collapseAll: string
  overview: string
  noResults: string
  theme: string
  sectionError: string
}

export const docStrings: Record<Locale, DocStrings> = {
  fr: {
    none: 'Aucun.',
    fullData: 'données complètes dans',
    jsonLink: 'JSON',
    backToReadme: '← LISEZ-MOI',
    entryCount: (n) => `${n} élément${n === 1 ? '' : 's'}`,
    name: 'Nom',
    citizenId: 'Identifiant citoyen',
    sex: 'Sexe',
    birthDate: 'Date de naissance',
    healthCard: "Carte d'assurance maladie",
    expires: 'expire',
    email: 'Courriel',
    phone: 'Téléphone',
    address: 'Adresse',
    familyDoctor: 'Médecin de famille',
    activeRefills: 'Actifs (renouvellements restants)',
    completed: 'Terminés',
    unknownDrug: 'Médicament (détails non disponibles)',
    din: 'DIN',
    posology: 'Posologie',
    prescriber: 'Prescripteur',
    pharmacy: 'Pharmacie',
    prescribed: 'Prescrit le',
    days: 'jours',
    refills: 'Renouvellements',
    remaining: 'restants',
    lastDispensed: 'Dernière délivrance',
    reportN: (n) => `Rapport ${n}`,
    test: 'Analyse',
    value: 'Valeur',
    reference: 'Référence',
    whoAccessed: 'Qui a consulté votre dossier',
    person: 'Personne',
    role: 'Rôle',
    accesses: 'Accès',
    first: 'Premier',
    last: 'Dernier',
    accessLog: "Journal d'accès",
    accessSummary: (events, people) => `${events} accès par ${people} personne${people === 1 ? '' : 's'}`,
    domainImaging: 'Imagerie',
    domainMedications: 'Médicaments',
    domainLabs: 'Prélèvements',
    generatedFor: (name, citizen, date) => `Généré pour **${name}** (citoyen ${citizen}) le ${date}.`,
    whatsInside: 'Contenu de ce dossier',
    legendDocuments: '**documents/** — votre dossier en Markdown + les PDF officiels dans `documents/pdf/`.',
    legendDonnees: '**donnees/** — données structurées (JSON) pour usage avancé + `index.json` (index machine).',
    legendCapture: '**capture-brute/** — capture brute non transformée, pour débogage seulement.',
    legendDossier: '**dossier-complet.html** — tout votre dossier sur une seule page.',
    section: 'Section',
    count: 'Nombre',
    documentsCount: (n) => `${n} PDF téléchargé${n === 1 ? '' : 's'}.`,
    recordTitle: 'Dossier de santé complet',
    search: 'Rechercher dans le dossier…',
    expandAll: 'Tout déplier',
    collapseAll: 'Tout replier',
    overview: 'Aperçu',
    noResults: 'Aucun résultat.',
    theme: 'Thème clair/sombre',
    sectionError: "Cette section n'a pas pu être lue automatiquement — voir les données brutes dans `capture-brute/`.",
  },
  en: {
    none: 'None.',
    fullData: 'full data in',
    jsonLink: 'JSON',
    backToReadme: '← README',
    entryCount: (n) => `${n} item${n === 1 ? '' : 's'}`,
    name: 'Name',
    citizenId: 'Citizen ID',
    sex: 'Sex',
    birthDate: 'Birth date',
    healthCard: 'Health card',
    expires: 'expires',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    familyDoctor: 'Family doctor',
    activeRefills: 'Active (refills remaining)',
    completed: 'Completed',
    unknownDrug: 'Medication (details unavailable)',
    din: 'DIN',
    posology: 'Posology',
    prescriber: 'Prescriber',
    pharmacy: 'Pharmacy',
    prescribed: 'Prescribed',
    days: 'days',
    refills: 'Refills',
    remaining: 'remaining',
    lastDispensed: 'Last dispensed',
    reportN: (n) => `Report ${n}`,
    test: 'Test',
    value: 'Value',
    reference: 'Reference',
    whoAccessed: 'Who accessed your record',
    person: 'Person',
    role: 'Role',
    accesses: 'Accesses',
    first: 'First',
    last: 'Last',
    accessLog: 'Access log',
    accessSummary: (events, people) =>
      `${events} access event${events === 1 ? '' : 's'} by ${people} ${people === 1 ? 'person' : 'people'}`,
    domainImaging: 'Imaging',
    domainMedications: 'Medications',
    domainLabs: 'Labs',
    generatedFor: (name, citizen, date) => `Generated for **${name}** (citizen ${citizen}) on ${date}.`,
    whatsInside: "What's in this folder",
    legendDocuments: '**documents/** — your record in Markdown + the official PDFs in `documents/pdf/`.',
    legendDonnees: '**donnees/** — structured data (JSON) for power users + `index.json` (machine index).',
    legendCapture: '**capture-brute/** — untouched raw capture, debug only.',
    legendDossier: '**dossier-complet.html** — your entire record on one page.',
    section: 'Section',
    count: 'Count',
    documentsCount: (n) => `${n} PDF${n === 1 ? '' : 's'} downloaded.`,
    recordTitle: 'Complete health record',
    search: 'Search your record…',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    overview: 'Overview',
    noResults: 'No results.',
    theme: 'Light/dark theme',
    sectionError: 'This section could not be read automatically — see the raw data in `capture-brute/`.',
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
    partialDoneStep: (failed) =>
      `Terminé avec des données partielles — ces sections n'ont pu être récupérées : ${failed}. Le reste de votre dossier est prêt; réessayez pour compléter.`,
    collectingStep: (domain, done, total, sub) => `Collecte — ${domain} (${done}/${total})${sub}`,
    errorStep: (err) => `Erreur : ${err}`,
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
    partialDoneStep: (failed) =>
      `Done with partial data — these sections could not be retrieved: ${failed}. The rest of your record is ready; try again to fill the gaps.`,
    collectingStep: (domain, done, total, sub) => `Collecting — ${domain} (${done}/${total})${sub}`,
    errorStep: (err) => `Error: ${err}`,
    domainName: (key) => domainNames.en[key] ?? prettyFallback(key),
  },
}
