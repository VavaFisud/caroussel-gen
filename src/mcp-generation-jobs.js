import { randomUUID } from 'node:crypto';

const jobs = new Map();

export function startGenerationJob(label, task) {
  const id = randomUUID();
  const job = {
    id,
    label,
    status: 'running',
    created_at: new Date().toISOString(),
    finished_at: null,
    result: null,
    error: null
  };
  jobs.set(id, job);

  Promise.resolve()
    .then(task)
    .then((result) => {
      jobs.set(id, {
        ...job,
        status: 'done',
        finished_at: new Date().toISOString(),
        result
      });
    })
    .catch((error) => {
      jobs.set(id, {
        ...job,
        status: 'error',
        finished_at: new Date().toISOString(),
        error: error.message || String(error)
      });
    });

  return job;
}

export function getGenerationJob(id) {
  return jobs.get(id) || null;
}

export function listGenerationJobs() {
  return [...jobs.values()]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 50);
}
