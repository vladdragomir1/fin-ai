import { formatISO } from 'date-fns';
import { TrainingJob } from '@/types';

const clamp = (value: number, digits = 2) => Number(value.toFixed(digits));

export const createTrainingJob = (
  datasetSize = 600,
  epochs = 6,
): TrainingJob => ({
  id: `train-${Date.now()}`,
  status: 'running',
  startedAt: formatISO(new Date()),
  progress: 4,
  epochs,
  datasetSize,
  metrics: {
    loss: 1.0,
    accuracy: 0.4,
  },
  notes: 'Se rulează fine-tuning LoRA pe ultimele tranzacții etichetate.',
});

export type ProgressListener = (job: TrainingJob) => void;

export const simulateTraining = (
  initialJob: TrainingJob,
  listener: ProgressListener,
) => {
  let job = { ...initialJob };

  const interval = setInterval(() => {
    const nextProgress = Math.min(job.progress + Math.random() * 18, 100);
    const remaining = 100 - nextProgress;

    job = {
      ...job,
      progress: nextProgress,
      metrics: {
        loss: clamp(Math.max(0.08, job.metrics.loss - Math.random() * 0.2)),
        accuracy: clamp(Math.min(0.96, job.metrics.accuracy + Math.random() * 0.08)),
      },
      status: remaining <= 0 ? 'completed' : 'running',
      completedAt: remaining <= 0 ? formatISO(new Date()) : undefined,
    };

    listener(job);

    if (remaining <= 0) {
      clearInterval(interval);
    }
  }, 1200);

  return () => clearInterval(interval);
};
