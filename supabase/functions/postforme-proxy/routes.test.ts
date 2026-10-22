import { describe, it, expect } from 'vitest';
import { classify } from './routes.ts';

describe('postforme-proxy classify', () => {
  it('allows exactly the four operations the app uses', () => {
    expect(classify('GET', '/v1/social-accounts')).toEqual({ op: 'list_accounts' });
    expect(classify('POST', '/v1/social-accounts/auth-url')).toEqual({ op: 'auth_url' });
    expect(classify('POST', '/v1/social-posts')).toEqual({ op: 'create_post' });
    expect(classify('POST', '/v1/social-accounts/spc_123/disconnect')).toEqual({ op: 'disconnect_account', accountId: 'spc_123' });
  });

  it('refuses per-id reads and writes it used to pass through', () => {
    for (const [m, p] of [
      ['GET', '/v1/social-account-feeds/spc_victim'],
      ['GET', '/v1/social-accounts/spc_victim'],
      ['DELETE', '/v1/social-posts/sp_victim'],
      ['PUT', '/v1/social-posts/sp_victim'],
      ['GET', '/v1/social-post-results'],
      ['POST', '/v1/media/create-upload-url'],
      ['GET', '/v1/social-accounts?external_id=victim'],
      ['POST', '/v1/social-accounts/../social-posts/disconnect'],
      ['GET', '/v1/social-accounts/spc_1/disconnect'],
    ]) {
      expect(classify(m, p), `${m} ${p}`).toBeNull();
    }
  });
});
