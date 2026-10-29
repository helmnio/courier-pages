import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
type Result = { status: number | null; stdout: string; stderr: string; error?: Error };
type Runner = (command: string, args: string[], env: NodeJS.ProcessEnv) => Result;
const run: Runner = (command, args, env) =>
  spawnSync(command, args, {
    env,
    encoding: 'utf8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export function normalizeRuntimeKey(value: string) {
  let key = value.replace(/\u001b\[(?:200|201)~/g, '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
    key = key.slice(1, -1).trim();
  return key;
}
export function verifyTunnelAccess(
  tunnelId: string,
  environment: NodeJS.ProcessEnv,
  runner: Runner = run,
) {
  const key = normalizeRuntimeKey(environment.CONTROL_PLANE_API_KEY ?? '');
  if (!key)
    return {
      ok: false,
      code: 'missing_runtime_key',
      message: 'Enter the runtime API key at the hidden prompt.',
    };
  if (/[\r\n\u0000]/.test(key) || key.startsWith('sk-admin-'))
    return {
      ok: false,
      code: 'invalid_runtime_key',
      message:
        'The pasted value contains a line break or is an Admin key. Paste only the regular runtime secret key from the creation dialog.',
    };
  if (!/^tunnel_[a-f0-9]{32}$/.test(tunnelId))
    return {
      ok: false,
      code: 'invalid_tunnel_id',
      message: 'The configured tunnel ID is invalid.',
    };
  const env: NodeJS.ProcessEnv = { ...environment, CONTROL_PLANE_API_KEY: key };
  delete env.OPENAI_ADMIN_KEY;
  const binary = fileURLToPath(new URL('./bin/tunnel-client', import.meta.url));
  const result = runner(binary, ['admin', '--json', 'tunnels', 'get', tunnelId], env);
  if (result.status === 0)
    return {
      ok: true,
      code: 'tunnel_auth_verified',
      message:
        'OpenAI accepted the runtime key and allowed access to this tunnel. Polling must still succeed before the remote plugin is connected.',
    };
  // Vendor diagnostics can include credential fragments. Never forward raw stdout/stderr.
  const errorText = result.stdout + ' ' + result.stderr;
  if (/\b401\b|unauthorized/i.test(errorText))
    return {
      ok: false,
      code: 'tunnel_auth_401',
      message:
        'OpenAI rejected this runtime key (401). Check the key, its organization and tunnel access. No remote connection has been established.',
    };
  if (/\b403\b|forbidden/i.test(errorText))
    return {
      ok: false,
      code: 'tunnel_auth_403',
      message:
        'OpenAI denied tunnel access (403). The runtime-key owner needs Tunnels Read + Use for the organization that owns this tunnel.',
    };
  if (/\b404\b|not found/i.test(errorText))
    return {
      ok: false,
      code: 'tunnel_not_found',
      message:
        'This tunnel was not found for the runtime key’s organization. Check the tunnel ID and account association.',
    };
  return {
    ok: false,
    code: 'tunnel_auth_check_failed',
    message:
      'The authenticated tunnel check failed or timed out. Check internet access and the runtime-key organization. No remote connection has been established.',
  };
}
