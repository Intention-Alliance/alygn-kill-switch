/**
 * EmailProviderFactory
 * Creates email provider instances based on type
 */
import type { EmailProvider } from './providers/EmailProvider';

export class EmailProviderFactory {
  /**
   * Create email provider instance
   */
  static async create(type: string, config: Record<string, unknown> = {}): Promise<EmailProvider> {
    switch (type.toLowerCase()) {
      case 'smtp': {
        const { SMTPProvider } = await import('./providers/SMTPProvider');
        return new SMTPProvider(config);
      }
      case 'smartlead': {
        const { SmartleadProvider } = await import('./providers/SmartleadProvider');
        return new SmartleadProvider(config);
      }
      default:
        throw new Error(`Unknown email provider type: ${type}`);
    }
  }

  /**
   * Get available provider types
   */
  static getAvailableTypes(): string[] {
    return ['smtp', 'smartlead'];
  }
}

export default EmailProviderFactory;
