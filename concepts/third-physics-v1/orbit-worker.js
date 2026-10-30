import { rederive } from './orbit.js';

self.onmessage = (event) => {
  const result = rederive({ ...event.data, onProgress: (progress) => self.postMessage({ type: 'progress', ...progress }) });
  self.postMessage({ type: 'done', result }, [result.positions.buffer, result.separations.buffer, result.gate.buffer]);
};
