/**
 * Type declarations for modules without types
 */
declare module 'nodemailer' {
  export interface SendMailOptions {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
    headers?: Record<string, string>;
    [key: string]: unknown;
  }

  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<{ messageId: string }>;
    verify(): Promise<boolean>;
  }

  export interface TransporterConfiguration {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user?: string;
      pass?: string;
    };
    [key: string]: unknown;
  }

  export function createTransport(config: TransporterConfiguration): Transporter;
}
