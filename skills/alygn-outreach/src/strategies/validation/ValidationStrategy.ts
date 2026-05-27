/**
 * ValidationStrategy - Email validation using existing validators
 */
import type { OutreachEntity } from '../../entities/OutreachEntity';
import type { EmailValidator, IEmailValidationResult } from '../../lib/email/validators/EmailValidator';

interface ValidationResult {
  result: 'valid' | 'invalid' | 'risky' | 'unknown' | 'error';
  confidence: number;
  details?: {
    reason?: string;
    message?: string;
    error?: string;
    rawStatus?: string;
  };
  validator?: string;
}

export class ValidationStrategy {
  protected config: Record<string, unknown>;
  protected validatorType: string;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    // AUTO_ZEROBOUNCE: Use ZeroBounce when API key is available (prevents hallucinations)
    this.validatorType = (config.validatorType as string) || 
      (process.env.ZEROBOUNCE_API_KEY ? 'zerobounce' : 'regex-mx');
  }

  /**
   * Initialize validator
   */
  initialize(): void {
    // No-op: validator is created dynamically in validate()
  }

  /**
   * Validate entity email
   */
  async validate(entity: OutreachEntity): Promise<ValidationResult> {
    if (!entity.email) {
      return {
        result: 'unknown',
        confidence: 0,
        details: { reason: 'no_email' },
        validator: 'none'
      };
    }
    
    console.log(`🔍 Validating email: ${entity.email}`);
    
    try {
      // Use local validator factory
      const { EmailValidatorFactory } = await import('../../lib/email/validators/EmailValidatorFactory');
      
      const validatorConfig = this.validatorType === 'zerobounce' 
        ? { apiKey: process.env.ZEROBOUNCE_API_KEY }
        : {};
      
      const validator: EmailValidator = EmailValidatorFactory.create(this.validatorType, validatorConfig);
      const result: IEmailValidationResult = await validator.validate(entity.email);
      
      // Attach to entity
      entity.setEmailValidation(result);
      
      if (result.result === 'valid') {
        console.log(`   ✅ Email validated (${result.confidence * 100}% confidence)`);
        entity.updateStatus('validated');
      } else {
        console.log(`   ⚠️  Email ${result.result}: ${result.details?.reason || 'unknown'}`);
      }
      
      return result;
      
    } catch (error) {
      const err = error as Error;
      console.error(`   ❌ Validation failed: ${err.message}`);
      return {
        result: 'error',
        confidence: 0,
        details: { error: err.message },
        validator: this.validatorType
      };
    }
  }

  /**
   * Batch validate multiple entities
   */
  async validateBatch(
    entities: OutreachEntity[], 
    options: { rateLimitMs?: number } = {}
  ): Promise<Array<{ entity: string; result: ValidationResult }>> {
    const results: Array<{ entity: string; result: ValidationResult }> = [];
    
    for (const entity of entities) {
      const result = await this.validate(entity);
      results.push({ entity: entity.name, result });
      
      // Rate limiting between validations
      if (options.rateLimitMs && options.rateLimitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, options.rateLimitMs));
      }
    }
    
    return results;
  }
}

export default ValidationStrategy;
