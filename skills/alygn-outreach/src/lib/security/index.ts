/**
 * Security module — rate limiting, endpoint protection, and vulnerability scanning
 */
export { RateLimiter, type TokenBucketConfig, type ConsumeResult } from './RateLimiter';
export {
  EndpointRateLimiter,
  type EndpointPreset,
  type EndpointLimitConfig,
  type EndpointConsumeResult,
} from './EndpointRateLimiter';
export {
  SecurityScanner,
  type VulnerabilitySeverity,
  type VulnerabilityCategory,
  type VulnerabilityReport,
  type VulnerabilityEntry,
  type VulnerabilitySummary,
  type SecurityScanOptions,
  type InputField,
} from './SecurityScanner';