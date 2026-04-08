/**
 * EmailProviderFactory
 * Creates email provider instances based on type
 */
import { EmailProvider } from './providers/EmailProvider';
import type { EmailProvider as EmailProviderType } from './providers/EmailProvider';
import { SMTPProvider } from './providers/SMTPProvider';

export class EmailProviderFactory {
  /**
   * Create email provider instance
   */
  static async create(type: string, config: Record<string, unknown> = {}): Promise<EmailProviderType> {
    switch (type.toLowerCase()) {
      case 'smtp': {
        return new SMTPProvider(config);
      }
      default:
        throw new Error(`Unknown email provider type: ${type}`);
    }
  }

  /**
   * Get available provider types
   */
  static getAvailableTypes(): string[] {
    return ['smtp'];
  }
}

export default EmailProviderFactory;
