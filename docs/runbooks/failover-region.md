# Regional Failover Runbook

**Issue #111 - Business Continuity Plan**  
**Last Updated:** 2024-01-15  
**RTO Target:** 30 minutes  
**RPO Target:** 15 minutes

---

## Pre-Flight Checklist

### Before Initiating Failover

- [ ] **Incident Confirmed**: Primary region failure verified via monitoring alerts
- [ ] **Impact Assessment**: Services affected identified and documented
- [ ] **Stakeholder Notification**: On-call engineer notified and engaged
- [ ] **Failover Authorization**: CTO or VP Engineering approval obtained
- [ ] **Backup Verification**: Latest backups verified within RPO (15 min)
- [ ] **DNS TTL Check**: DNS TTL values noted (recommend < 300s)
- [ ] **Secondary Region Health**: Target region services confirmed healthy
- [ ] **Database Replication Lag**: Replication lag confirmed < 5 minutes
- [ ] **Runbook Access**: This runbook accessible from secondary location

### Required Information

| Item | Primary | Secondary | Status |
|------|---------|-----------|--------|
| Region | us-east-1 | us-west-2 | ⬜ |
| Database Endpoint | db-primary... | db-secondary... | ⬜ |
| Load Balancer | alb-primary... | alb-secondary... | ⬜ |
| CDN Endpoint | cdn.primary... | cdn.secondary... | ⬜ |
| Last Backup Time | | | ⬜ |
| Replication Lag | | | ⬜ |

---

## 5-Phase Failover Procedure

### Phase 1: Stop the Bleeding (0-5 minutes)

**Objective:** Prevent further data loss and stabilize the situation.

1. **Pause Write Operations**
   ```bash
   # Set maintenance mode in application
   kubectl set env deployment/app MAINTENANCE_MODE=true
   
   # Or disable write endpoints at load balancer
   aws elbv2 modify-rule --rule-arn <arn> --actions Type=fixed-response,FixedResponseConfig={MessageBody="Maintenance",StatusCode=503}
   ```

2. **Document Current State**
   - Screenshot current error rates
   - Note exact failure time (UTC)
   - Capture current replication lag

3. **Notify Stakeholders**
   - Post in #incidents Slack channel
   - Page on-call if not already done
   - Update status page to "Degraded Performance"

**Checkpoint:** Write operations stopped, team notified.

---

### Phase 2: Prepare Secondary Region (5-15 minutes)

**Objective:** Ensure secondary region is ready to take traffic.

1. **Verify Secondary Database**
   ```bash
   # Check replication status
   psql -h $DB_SECONDARY_HOST -U admin -c "SELECT pg_last_xact_replay_timestamp();"
   
   # Verify data consistency (spot check)
   psql -h $DB_SECONDARY_HOST -U admin -c "SELECT COUNT(*) FROM critical_table;"
   ```

2. **Scale Up Secondary Services**
   ```bash
   # Scale up application tier
   kubectl scale deployment app --replicas=5 --context=secondary-cluster
   
   # Verify pods are ready
   kubectl wait --for=condition=ready pod -l app=app --timeout=120s --context=secondary-cluster
   ```

3. **Warm Up Cache**
   ```bash
   # Pre-populate Redis cache
   redis-cli -h $REDIS_SECONDARY --eval warmup-cache.lua
   ```

4. **Run Health Checks**
   ```bash
   curl -f https://secondary-region.health-check-endpoint
   ```

**Checkpoint:** Secondary region healthy and scaled.

---

### Phase 3: Promote Secondary Database (15-20 minutes)

**Objective:** Make secondary database the primary.

1. **Stop Replication**
   ```bash
   # On secondary (becomes primary)
   psql -h $DB_SECONDARY_HOST -U admin -c "SELECT pg_promote();"
   ```

2. **Verify Promotion**
   ```bash
   # Confirm read-write mode
   psql -h $DB_SECONDARY_HOST -U admin -c "SELECT pg_is_in_recovery();" 
   # Should return 'f' (false)
   ```

3. **Update Connection Strings**
   ```bash
   # Update secrets manager
   aws secretsmanager put-secret-value \
     --secret-id db-primary-connection \
     --secret-string '{"host":"'$DB_SECONDARY_HOST'","port":5432}'
   ```

4. **Restart Application Pods**
   ```bash
   kubectl rollout restart deployment/app --context=secondary-cluster
   ```

**Checkpoint:** Database promoted, apps reconnecting.

---

### Phase 4: Route Traffic (20-25 minutes)

**Objective:** Direct user traffic to secondary region.

1. **Update DNS**
   ```bash
   # Update Route53 record
   aws route53 change-resource-record-sets \
     --hosted-zone-id $ZONE_ID \
     --change-batch '{
       "Changes": [{
         "Action": "UPSERT",
         "ResourceRecordSet": {
           "Name": "api.company.com",
           "Type": "A",
           "AliasTarget": {
             "HostedZoneId": "Z1H1FL5HABSF5",
             "DNSName": "'$ALB_SECONDARY_DNS_NAME'",
             "EvaluateTargetHealth": true
           }
         }
       }]
     }'
   ```

2. **Update CDN Origin**
   ```bash
   # Update CloudFront origin
   aws cloudfront update-distribution \
     --id $DISTRIBUTION_ID \
     --distribution-config file://secondary-origin-config.json
   ```

3. **Verify Traffic Flow**
   ```bash
   # Check logs for requests
   kubectl logs -l app=app --context=secondary-cluster --tail=100 | grep "200 OK"
   ```

4. **Disable Maintenance Mode**
   ```bash
   kubectl set env deployment/app MAINTENANCE_MODE=false --context=secondary-cluster
   ```

**Checkpoint:** Traffic flowing to secondary region.

---

### Phase 5: Verify and Monitor (25-30 minutes)

**Objective:** Confirm successful failover and establish monitoring.

1. **Health Verification**
   - [ ] All services responding 200 OK
   - [ ] Database write operations succeeding
   - [ ] No error spikes in logs
   - [ ] Latency within acceptable range

2. **Run Smoke Tests**
   ```bash
   ./scripts/smoke-tests.sh --region=secondary
   ```

3. **Update Monitoring**
   - Switch primary alerts to secondary region
   - Update dashboard data sources

4. **Communicate Status**
   - Update status page to "All Systems Operational"
   - Post resolution in #incidents
   - Send all-clear to stakeholders

**Checkpoint:** Failover complete, monitoring active.

---

## Rollback Instructions

### When to Rollback

- Primary region recovered AND
- Secondary region showing issues OR
- Business decision to revert

### Rollback Procedure

1. **Re-enable Maintenance Mode**
   ```bash
   kubectl set env deployment/app MAINTENANCE_MODE=true --context=secondary-cluster
   ```

2. **Re-establish Replication**
   ```bash
   # Reconfigure primary as replica of secondary
   psql -h $DB_PRIMARY_HOST -U admin -c "SELECT pg_replication_origin_create('secondary');"
   ```

3. **Reverse DNS/CDN Changes**
   ```bash
   # Restore original Route53 records
   aws route53 change-resource-record-sets \
     --hosted-zone-id $ZONE_ID \
     --change-batch file://primary-dns-config.json
   ```

4. **Verify Primary Health**
   ```bash
   ./scripts/smoke-tests.sh --region=primary
   ```

5. **Disable Maintenance Mode**
   ```bash
   kubectl set env deployment/app MAINTENANCE_MODE=false --context=primary-cluster
   ```

**Note:** Rollback may result in data loss if writes occurred during failover window. Consult with database team before proceeding.

---

## Contact Escalation Tree

### Level 1: On-Call Engineer
- **Primary:** See PagerDuty rotation
- **Response Time:** 5 minutes
- **Responsibilities:** Initial assessment, begin Phase 1

### Level 2: Engineering Lead
- **Contact:** #incidents Slack channel
- **Response Time:** 15 minutes
- **Responsibilities:** Technical decision making, authorize failover

### Level 3: CTO / VP Engineering
- **Contact:** emergency@company.com
- **Response Time:** 30 minutes
- **Responsibilities:** Business impact assessment, external communications

### Level 4: Executive Team
- **Contact:** CEO office
- **Response Time:** 1 hour
- **Responsibilities:** Customer communications, regulatory notifications

### External Contacts

| Service | Contact | Escalation |
|---------|---------|------------|
| AWS Support | support@amazon.com | Business Support Case |
| Cloudflare | support@cloudflare.com | Priority Support |
| Datadog | support@datadoghq.com | Enterprise Support |

---

## Post-Incident Requirements

1. **Timeline Documentation**: Complete within 24 hours
2. **Root Cause Analysis**: Complete within 72 hours
3. **Lessons Learned**: Schedule within 1 week
4. **Runbook Updates**: Update this document with findings
5. **DR Drill**: Schedule next failover test

---

## Appendix

### Quick Reference Commands

```bash
# Check database replication lag
psql -h $DB_HOST -c "SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;"

# Force deployment restart
kubectl rollout restart deployment/app

# Check service endpoints
kubectl get endpoints service-name

# View recent errors
kubectl logs --selector app=app --tail=500 | grep ERROR
```

### Related Documentation

- [Database Replication Setup](../architecture/database-replication.md)
- [Monitoring Dashboards](https://grafana.company.com/d/failover)
- [Architecture Diagrams](../architecture/multi-region.md)
