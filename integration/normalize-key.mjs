import { normalizeRuntimeKey } from './tunnel-auth.ts';
// This stdout is captured by the launcher's private pipe, never displayed or logged.
process.stdout.write(normalizeRuntimeKey(process.env.CONTROL_PLANE_API_KEY ?? ''));
