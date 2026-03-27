/**
 * ValidationStrategy - Email validation using existing validators
 */
import type { OutreachEntity } from '../entities/OutreachEntity.js';

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
  protected validator: unknown;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
    this.validator = null;
  }
  
  /**
   * Initialize validator
   */
  initialize(): void {
    const validatorType = this.config.validatorType || 'regex-mx';
    
    // For TypeScript, we'll handle this dynamically
    this.validator = { type: validatorType };
  }
  
  /**
   * Validate entity email
   * @param entity - Entity to validate
   * @returns Promise<Object> Validation result
   */
  async validate(entity: OutreachEntity): Promise<ValidationResult> {
    if (!this.validator) {
      this.initialize();
    }
    
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
      const { EmailValidatorFactory } = await import('../../lib/email/validators/EmailValidatorFactory.js');
      
      const validatorType = this.config.validatorType || 'regex-mx';
      const validatorConfig = validatorType === 'zerobounce' 
        ? { apiKey: process.env.ZEROBOUNCE_API_KEY }
        : {};
      
      const validator = EmailValidatorFactory.create(validatorType as string, validatorConfig);
      const result = await validator.validate(entity.email);
      
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
      console.error(`   ❌ Validation failed: ${(error as Error).message}`);
      return {
        result: 'error',
        confidence: 0,
        details: { error: (error as Error).message },
        validator: (this.validator as { type: string })?.type || 'unknown'
      };
    }
  }
  
  /**
   * Batch validate multiple entities
   */
  async validateBatch(entities: OutreachEntity[], options: { rateLimitMs?: number } = {}): Promise<Array<{ entity: string; result: ValidationResult }>> {
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
