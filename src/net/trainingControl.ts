import { stopDemoTrain } from './demoTrain'
import { stopTrain } from './trainSocket'

export function stopTraining(): void {
  stopDemoTrain()
  stopTrain()
}
