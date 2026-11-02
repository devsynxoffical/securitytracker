import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MailerService, readMailerSettings } from '../src/common/mailer.service';
import { passwordResetMail } from '../src/auth/auth.service';

describe('MailerService', () => {
  it('readMailerSettings needs SMTP_HOST and MAIL_FROM; secure defaults from the port', () => {
    expect(readMailerSettings(() => undefined)).toBeNull();
    expect(readMailerSettings((k) => ({ SMTP_HOST: 'smtp.x', MAIL_FROM: 'a@x' } as Record<string, string>)[k])).toMatchObject({ port: 587, secure: false });
    expect(readMailerSettings((k) => ({ SMTP_HOST: 'smtp.x', MAIL_FROM: 'a@x', SMTP_PORT: '465' } as Record<string, string>)[k])).toMatchObject({ port: 465, secure: true });
    expect(readMailerSettings((k) => ({ SMTP_HOST: 'smtp.x', MAIL_FROM: 'a@x', SMTP_PORT: '465', SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASSWORD: 'p' } as Record<string, string>)[k])).toMatchObject({ secure: false, user: 'u', password: 'p' });
  });

  it('is a no-op when not configured and sends through the transport when it is', async () => {
    const off = new MailerService(new ConfigService({}));
    expect(off.configured()).toBe(false);
    expect(await off.send({ to: 'a@x', subject: 's', html: '<p>h</p>' })).toBe(false);

    const sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
    const factory = vi.fn().mockReturnValue({ sendMail });
    const on = new MailerService(new ConfigService({ SMTP_HOST: 'smtp.x', SMTP_PORT: '587', MAIL_FROM: 'Company OS <no-reply@x>' }), factory);
    expect(on.configured()).toBe(true);
    expect(await on.send({ to: 'a@x', subject: 'Hi', html: '<p>Hello <b>you</b></p>' })).toBe(true);
    expect(factory).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.x', port: 587, secure: false }));
    expect(sendMail).toHaveBeenCalledWith({ from: 'Company OS <no-reply@x>', to: 'a@x', subject: 'Hi', html: '<p>Hello <b>you</b></p>', text: 'Hello you' });
    expect(factory).toHaveBeenCalledTimes(1);
    await on.send({ to: 'b@x', subject: 'Again', html: '<p>x</p>' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('propagates transport failures', async () => {
    const svc = new MailerService(new ConfigService({ SMTP_HOST: 'smtp.x', MAIL_FROM: 'a@x' }), () => ({ sendMail: vi.fn().mockRejectedValue(new Error('EAUTH')) }) as any);
    await expect(svc.send({ to: 'a@x', subject: 's', html: 'h' })).rejects.toThrow('EAUTH');
  });

  it('passwordResetMail carries the link and the validity, nothing else personal', () => {
    const m = passwordResetMail('a@x', 'https://admin/reset?token=abc', 1800);
    expect(m.to).toBe('a@x');
    expect(m.text).toContain('https://admin/reset?token=abc');
    expect(m.text).toContain('30 minutes');
    expect(m.html).toContain('href="https://admin/reset?token=abc"');
  });
});
