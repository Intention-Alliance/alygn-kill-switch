/**
 * Email Delivery Webhook Handler for Alygn Outreach
 * Handles delivery status updates from email providers
 * 
 * Usage:
 *   import { handleDeliveryWebhook, createWebhookEndpoint } from './webhook-handler.js';
 *   
 *   // In your Express/Hono server:
 *   app.post('/webhooks/email-delivery', async (c) => {
 *     const payload = await c.req.json();
 *     const result = await handleDeliveryWebhook(payload);
 *     return c.json(result);
 *   });
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Initialize Supabase client (lazy)
let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * Handle delivery webhook payload
 * Updates Supabase with delivery status
 * 
 * @param {Object} payload - Webhook payload
 * @param {string} payload.messageId - Email message ID
 * @param {string} payload.status - Delivery status (delivered, bounced, failed, opened, clicked)
 * @param {string} payload.timestamp - ISO timestamp of event
 * @param {string} payload.recipient - Recipient email address
 * @param {string} [payload.reason] - Bounce/failure reason (if applicable)
 * @returns {Promise<Object>} - Result of update operation
 */
export async function handleDeliveryWebhook(payload) {
  const { messageId, status, timestamp, recipient, reason } = payload;
  
  // Validate required fields
  if (!messageId || !status) {
    console.error('Webhook: Missing required fields (messageId, status)');
    return {
      success: false,
      error: 'Missing required fields: messageId, status'
    };
  }
  
  const supabase = getSupabaseClient();
  
  // Build update object
  const updateData = {
    delivery_status: status,
    delivered_at: timestamp || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Add reason if provided (for bounces/failures)
  if (reason) {
    updateData.delivery_reason = reason;
  }
  
  // Update Supabase
  const { data, error } = await supabase
    .from('outreach_emails')
    .update(updateData)
    .eq('message_id', messageId);
  
  if (error) {
    console.error('Webhook update failed:', error);
    return {
      success: false,
      error: error.message,
      messageId
    };
  }
  
  // Log bounce/failure events
  if (status === 'bounced' || status === 'failed') {
    console.warn(`⚠️ Email to ${recipient} ${status}${reason ? `: ${reason}` : ''}`);
  } else if (status === 'delivered') {
    console.log(`✅ Email to ${recipient} delivered successfully`);
  } else if (status === 'opened') {
    console.log(`👁️ Email to ${recipient} opened`);
  } else if (status === 'clicked') {
    console.log(`🖱️ Email to ${recipient} clicked link`);
  }
  
  return {
    success: true,
    messageId,
    status,
    recipient,
    updated: data
  };
}

/**
 * Handle batch webhook events (for providers that send multiple events)
 * 
 * @param {Array<Object>} events - Array of webhook events
 * @returns {Promise<Object>} - Batch results
 */
export async function handleBatchWebhooks(events) {
  const results = {
    total: events.length,
    successful: 0,
    failed: 0,
    errors: []
  };
  
  for (const event of events) {
    const result = await handleDeliveryWebhook(event);
    
    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
      results.errors.push({
        messageId: event.messageId,
        error: result.error
      });
    }
  }
  
  return results;
}

/**
 * Validate webhook signature (for providers that sign payloads)
 * 
 * @param {string} signature - Signature from header
 * @param {string} payload - Raw payload body
 * @param {string} secret - Webhook secret
 * @returns {boolean} - True if signature is valid
 */
export function validateWebhookSignature(signature, payload, secret) {
  if (!signature || !payload || !secret) {
    return false;
  }
  
  // Implementation depends on provider (HMAC-SHA256 typically)
  // This is a placeholder for provider-specific validation
  console.warn('Webhook signature validation not implemented for this provider');
  return true; // Pass-through for now
}

/**
 * Parse webhook from different provider formats
 * Normalizes to standard format
 * 
 * @param {Object} rawPayload - Raw webhook payload
 * @param {string} provider - Provider name (smtp, sendgrid, mailgun, etc.)
 * @returns {Object} - Normalized payload
 */
export function parseWebhookPayload(rawPayload, provider = 'smtp') {
  switch (provider) {
    case 'sendgrid':
      return {
        messageId: rawPayload.sg_message_id,
        status: rawPayload.event, // delivered, bounce, open, click, etc.
        timestamp: new Date(rawPayload.timestamp * 1000).toISOString(),
        recipient: rawPayload.email,
        reason: rawPayload.reason || rawPayload.response
      };
    
    case 'mailgun':
      return {
        messageId: rawPayload.message?.headers?.['message-id'],
        status: rawPayload.event,
        timestamp: rawPayload.timestamp,
        recipient: rawPayload.recipient,
        reason: rawPayload.deliveryStatus?.message || rawPayload.reason
      };
    
    case 'ses':
      return {
        messageId: rawPayload.mail?.messageId,
        status: rawPayload.eventType?.toLowerCase() || 'unknown',
        timestamp: rawPayload.mail?.timestamp,
        recipient: rawPayload.delivery?.recipients?.[0],
        reason: rawPayload.delivery?.errorMessage
      };
    
    default:
      // Assume standard format
      return {
        messageId: rawPayload.messageId,
        status: rawPayload.status,
        timestamp: rawPayload.timestamp,
        recipient: rawPayload.recipient,
        reason: rawPayload.reason
      };
  }
}

export default {
  handleDeliveryWebhook,
  handleBatchWebhooks,
  validateWebhookSignature,
  parseWebhookPayload
};
