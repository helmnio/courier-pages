import { it, expect } from 'vitest';
import { verifyTunnelAccess } from '../integration/tunnel-auth';
const id = 'tunnel_0123456789abcdef0123456789abcdef';
it('passes a runtime key only through the child environment and never exposes rejected key text', () => {
  const key = 'sk-isolated-test-only';
  const result = verifyTunnelAccess(
    id,
    { CONTROL_PLANE_API_KEY: key, OPENAI_ADMIN_KEY: 'admin-test-only' },
    (_bin, args, env) => {
      expect(args).not.toContain(key);
      expect(env.CONTROL_PLANE_API_KEY).toBe(key);
      expect(env.OPENAI_ADMIN_KEY).toBeUndefined();
      return { status: 1, stdout: '', stderr: '401 Unauthorized. Incorrect key provided: ' + key };
    },
  );
  expect(result.code).toBe('tunnel_auth_401');
  expect(JSON.stringify(result)).not.toContain(key);
});
it('distinguishes missing keys, authorization denial and verified tunnel metadata', () => {
  expect(verifyTunnelAccess(id, {}).code).toBe('missing_runtime_key');
  expect(verifyTunnelAccess(id, { CONTROL_PLANE_API_KEY: 'sk-admin-secret' }).code).toBe(
    'invalid_runtime_key',
  );
  const denied = verifyTunnelAccess(id, { CONTROL_PLANE_API_KEY: 'sk-test' }, () => ({
    status: 1,
    stdout: '',
    stderr: '403 Forbidden',
  }));
  expect(denied.code).toBe('tunnel_auth_403');
  const accepted = verifyTunnelAccess(id, { CONTROL_PLANE_API_KEY: 'sk-test' }, () => ({
    status: 0,
    stdout: '{}',
    stderr: '',
  }));
  expect(accepted.ok).toBe(true);
  expect(accepted.message).toContain('Polling must still succeed');
});

it('normalizes bracketed terminal pastes and quotes consistently without assuming an API-key prefix', () => {
  const pasted = '\u001b[200~"opaque-runtime-credential"\u001b[201~';
  const result = verifyTunnelAccess(id, { CONTROL_PLANE_API_KEY: pasted }, (_bin, _args, env) => {
    expect(env.CONTROL_PLANE_API_KEY).toBe('opaque-runtime-credential');
    return { status: 0, stdout: '{}', stderr: '' };
  });
  expect(result.ok).toBe(true);
  expect(JSON.stringify(result)).not.toContain('opaque-runtime-credential');
});
