import { accessCollector } from './access.js'
import { appointmentsCollector } from './appointments.js'
import { imagingCollector } from './imaging.js'
import { labsCollector } from './labs.js'
import { medicalServicesCollector } from './medical-services.js'
import { medicationsCollector } from './medications.js'
import { profileCollector } from './profile.js'
import { type Collector } from './types.js'

export const collectors: Collector[] = [
  profileCollector,
  medicationsCollector,
  appointmentsCollector,
  medicalServicesCollector,
  imagingCollector,
  labsCollector,
  accessCollector,
]
