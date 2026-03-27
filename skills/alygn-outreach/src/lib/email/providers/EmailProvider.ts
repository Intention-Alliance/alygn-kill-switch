/**
 * EmailProvider Interface
 * Abstract base class for all email providers
 */
export interface IEmailPayload {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  headers?: Record<string, string>;
}

export interface ISendResult {
  success: boolean;
  messageId?: string;
  provider?: string;
  to?: string;
  subject?: string;
  campaignId?: string;
  cc?: string | null;
  error?: string;
}

export abstract class EmailProvider {
  protected config: Record<string, unknown>;
  protected apiKey?: string;
  protected baseUrl: string;

  constructor() {
    this.config = {};
    this.baseUrl = '';
  }

  /**
   * Send an email
   */
  abstract send(payload: IEmailPayload): Promise<ISendResult>;

  /**
   * Validate provider configuration
   */
  abstract validateConfig(): Promise<boolean>;

  /**
   * Get provider name
   */
  abstract getName(): string;
}

export default EmailProvider;
