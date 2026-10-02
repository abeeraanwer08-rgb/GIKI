import { describe, expect, it } from 'vitest';
import { ApiError } from './client';

describe('ApiError', () => {
  it('exposes the retry delay and error code the backend sends', () => {
    const limited = new ApiError(429, { error: 'Too many attempts.', retry_after: 900 }, 'Too many attempts.');
    expect(limited.retryAfter).toBe(900);
    expect(limited.code).toBe('Too many attempts.');
    const plain = new ApiError(400, 'bad', 'bad');
    expect(plain.retryAfter).toBeUndefined();
    expect(plain.code).toBeUndefined();
  });

  it('recognises the unverified-account response', () => {
    const forbidden = new ApiError(403, { error: 'email_not_verified', message: 'Verify your email.' }, 'Verify your email.');
    expect(forbidden.code).toBe('email_not_verified');
  });
});
