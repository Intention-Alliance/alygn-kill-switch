/**
 * Security module — rate limiting, endpoint protection, vulnerability scanning, and policy enforcement
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
export {
  SecurityPolicy,
  DEFAULT_SECURITY_RULES,
  type PolicyAction,
  type PolicyVerdict,
  type ContentFilterRule,
  type SecurityPolicyRules,
  type PolicyContext,
  type PolicyResult,
  type PolicyCheck,
} from './SecurityPolicy';
export {
  PolicyEnforcer,
  type PolicyEnforcerOptions,
  type EnforcedResult,
} from './PolicyEnforcer';
export {
  AccessReviewScheduler,
  type ReviewStatus,
  type ReviewItem,
  type ReviewSchedule,
  type ReviewReport,
  type AuditLogEntry,
} from './AccessReviewScheduler';
export {
  KeyRotationManager,
  type KeyStatus,
  type KeyMetadata,
  type KeyRotationManagerOptions,
  type GenerateKeyOptions,
} from './KeyRotationManager';

export {
  DataClassifier,
  SENSITIVITY_ORDER,
  DEFAULT_CLASSIFICATION_RULES,
  DEFAULT_HANDLING_POLICIES,
  type SensitivityLevel,
  type DataCategory,
  type ClassificationRule,
  type FieldClassification,
  type ClassificationResult,
  type DataHandlingPolicy,
  type DataClassifierOptions,
  type ClassificationEnforcementResult,
} from './DataClassifier';
export {
  ComplianceReportGenerator,
  type ComplianceReportType,
  type CompliancePeriod,
  type ComplianceFinding,
  type ComplianceRecommendation,
  type ComplianceReport,
  type ComplianceReportGeneratorOptions,
} from './ComplianceReportGenerator';
export {
  IncidentResponseManager,
  type IncidentType,
  type IncidentSeverity,
  type IncidentStatus,
  type Incident,
  type IncidentTimelineEntry,
  type IncidentResponseManagerOptions,
} from './IncidentResponseManager';
export {
  ThreatIntelligenceMonitor,
  type ThreatIndicatorType,
  type ThreatSeverity,
  type ThreatIndicator,
  type ThreatMatch,
  type ThreatCheckResult,
  type ThreatIntelligenceMonitorOptions,
} from './ThreatIntelligenceMonitor';
export {
  DisasterRecoveryManager,
  type RPO,
  type RTO,
  type PlanStatus,
  type ComplianceStatus,
  type RecoveryStep,
  type RecoveryTestResult,
  type DisasterRecoveryPlan,
  type ComplianceCheckResult,
  type DisasterRecoveryManagerOptions,
} from './DisasterRecoveryManager';

export {
  BusinessContinuityManager,
  type ContinuityPlanStatus,
  type ImpactLevel,
  type CriticalFunction,
  type Dependency,
  type ImpactAssessment,
  type ContinuityPlan,
  type ContinuityReport,
  type BusinessContinuityManagerOptions,
} from './BusinessContinuityManager';

export {
  SecretsManager,
  type SecretMetadata,
  type StoredSecret,
  type StoreSecretOptions,
  type SecretsManagerOptions,
} from './SecretsManager';

export {
  SecurityTrainingManager,
  type TrainingCategory,
  type TrainingModuleStatus,
  type AssignmentStatus,
  type TrainingModule,
  type TrainingAssignment,
  type TrainingReport,
  type CategoryReport,
  type OverdueUserEntry,
  type SecurityTrainingManagerOptions,
} from './SecurityTrainingManager';