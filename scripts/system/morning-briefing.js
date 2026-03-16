
/**
 * Multi-Org Morning Briefing Generator
 * 
 * Features:
 * - Admin assistant tone
 * - Focus: Yesterday, Today, Opportunities
 * - Asks questions for feedback
 * - Uses OpenClaw TTS (ElevenLabs Antoni - Wobblus gnome voice)
 * - Simplified language
 * 
 * Updated: 2026-03-07 - Fixed audio delivery via OpenClaw native TTS tool
 */

import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { success, error as logError } from "../shared/logger.js";

const WORKSPACE = process.env.HOME + '/.openclaw/workspace';
const REPORT_DIR = path.join(WORKSPACE, 'daily-reports');
const AUDIO_DIR = path.join(WORKSPACE, 'daily-reports/audio');

/**
 * Parse daily report to extract meaningful data
 */
async function parseReport(org, date) {
  const filenames = {
    alygn: `${date}-summary.txt`,
    bitcash: `bitcash-${date}.txt`,
    andlerrl: `andlerrl-${date}.txt`
  };
  
  try {
    const content = await fs.readFile(path.join(REPORT_DIR, filenames[org]), 'utf8');
    
    return {
      org,
      found: true,
      commits: extractCommits(content),
      sessions: extractSessions(content),
      emails: extractEmails(content),
      highlights: extractHighlights(content),
      rawContent: content
    };
  } catch {
    return { org, found: false };
  }
}

function extractCommits(text) {
  const match = text.match(/(\d+)\s+commit/i);
  return match ? parseInt(match[1]) : 0;
}

function extractSessions(text) {
  const match = text.match(/(\d+)\s+session/i);
  return match ? parseInt(match[1]) : 0;
}

function extractEmails(text) {
  const match = text.match(/(\d+)\s+email/i);
  return match ? parseInt(match[1]) : 0;
}

function extractHighlights(text) {
  // Extract bullet points or numbered lists
  const lines = text.split('\n');
  const highlights = [];
  
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned.match(/^[-*•]\s+/) || cleaned.match(/^\d+\.\s+/)) {
      highlights.push(cleaned.replace(/^[-*•\d.]+\s+/, ''));
    }
  }
  
  return highlights.slice(0, 3); // Top 3 highlights
}

/**
 * Generate intelligent briefing
 */
async function generateIntelligentBriefing() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Parse all org reports
  const [alygn, bitcash, andlerrl] = await Promise.all([
    parseReport('alygn', yesterday),
    parseReport('bitcash', yesterday),
    parseReport('andlerrl', yesterday)
  ]);
  
  // Build intelligent briefing
  let briefing = [];
  
  // === INTRODUCTION ===
  briefing.push("Good morning, Andler!");
  briefing.push("Here's your strategic overview for today.");
  
  // === YESTERDAY SECTION ===
  briefing.push("\nWhat Happened Yesterday:");
  
  if (alygn.found) {
    const summary = buildOrgSummary('ALYGN', alygn);
    if (summary) briefing.push(summary);
  }
  
  if (bitcash.found) {
    const summary = buildOrgSummary('BitcashOrg', bitcash);
    if (summary) briefing.push(summary);
  }
  
  if (andlerrl.found) {
    const summary = buildOrgSummary('Personal projects', andlerrl);
    if (summary) briefing.push(summary);
  }
  
  if (!alygn.found && !bitcash.found && !andlerrl.found) {
    briefing.push("No tracked activity yet. First day of monitoring.");
  }
  
  // === TODAY SECTION ===
  briefing.push("\nPriorities For Today:");
  
  const priorities = buildPriorities(alygn, bitcash, andlerrl);
  briefing.push(...priorities);
  
  // === OPPORTUNITIES SECTION ===
  briefing.push("\nOpportunities To Consider:");
  
  const opportunities = buildOpportunities(alygn, bitcash, andlerrl);
  briefing.push(...opportunities);
  
  // === QUESTIONS SECTION ===
  briefing.push("\nQuestions For You:");
  
  const questions = buildQuestions(alygn, bitcash, andlerrl);
  briefing.push(...questions);
  
  // === CLOSING ===
  briefing.push("\nLet's make it count today!");
  
  return briefing.join(' ');
}

/**
 * Build org summary (Yesterday section)
 */
function buildOrgSummary(name, data) {
  const parts = [];
  
  if (data.commits > 0) {
    parts.push(`${data.commits} commit${data.commits > 1 ? 's' : ''}`);
  }
  
  if (data.sessions > 0) {
    parts.push(`${data.sessions} work session${data.sessions > 1 ? 's' : ''}`);
  }
  
  if (data.highlights.length > 0) {
    parts.push(data.highlights[0]); // Most important highlight
  }
  
  if (parts.length === 0) {
    return `${name}: no tracked activity.`;
  }
  
  return `${name}: ${parts.join(', ')}.`;
}

/**
 * Build priorities (Today section)
 */
function buildPriorities(alygn, bitcash, andlerrl) {
  const priorities = [];
  
  // ALYGN priorities
  if (alygn.found) {
    if (alygn.commits === 0) {
      priorities.push("ALYGN: Push code updates or review pending tasks.");
    } else {
      priorities.push("ALYGN: Continue momentum from yesterday's work.");
    }
  }
  
  // Bitcash priorities
  if (bitcash.found) {
    priorities.push("BitcashOrg: Review repository status and plan next steps.");
  } else {
    priorities.push("BitcashOrg: Set up activity tracking and define goals.");
  }
  
  // Personal priorities
  if (andlerrl.found) {
    priorities.push("Personal: Allocate time for creative projects.");
  }
  
  return priorities.length > 0 ? priorities : ["Review your calendar and set daily goals."];
}

/**
 * Build opportunities (Strategic suggestions)
 */
function buildOpportunities(alygn, bitcash, andlerrl) {
  const opportunities = [];
  
  // Based on activity patterns
  if (alygn.found && alygn.commits > 5) {
    opportunities.push("ALYGN is gaining momentum. Consider expanding the team or accelerating roadmap.");
  }
  
  if (bitcash.found && bitcash.commits === 0) {
    opportunities.push("BitcashOrg could benefit from a development sprint. Schedule focus time this week.");
  }
  
  if (!opportunities.length) {
    opportunities.push("Evaluate which organization needs the most attention this week.");
    opportunities.push("Consider blocking focus time for deep work on your highest-impact project.");
  }
  
  return opportunities.slice(0, 2); // Max 2 opportunities
}

/**
 * Build questions (Admin assistant engagement)
 */
function buildQuestions(alygn, bitcash, andlerrl) {
  const questions = [];
  
  // Context-aware questions
  if (alygn.found && alygn.commits > 0) {
    questions.push("Should I prioritize any ALYGN tasks for you today?");
  }
  
  if (bitcash.found) {
    questions.push("When would you like to tackle the Bitcash migration?");
  } else {
    questions.push("Do you want me to set up BitcashOrg tracking today?");
  }
  
  // Always end with open question
  questions.push("What's your main focus for the next 8 hours?");
  
  return questions.slice(0, 3); // Max 3 questions
}

/**
 * Convert briefing to audio using OpenClaw TTS tool
 */
async function convertToAudio(text, date) {
  const audioPath = path.join(AUDIO_DIR, `${date}-briefing.ogg`);
  
  try {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    
    // Use OpenClaw's native tts tool (ElevenLabs Antoni)
    // This is more reliable than shell script wrapper
    const ttsCmd = `openclaw tts --channel whatsapp "${text.replace(/"/g, '\\"')}"`;
    
    console.log('🎙️  Generating speech with OpenClaw TTS...');
    execSync(ttsCmd, { stdio: 'inherit' });
    
    // The tts tool delivers audio automatically to the channel
    // We still save a local copy for reference
    const tempTextFile = path.join(AUDIO_DIR, `${date}-briefing.txt`);
    await fs.writeFile(tempTextFile, text);
    
    return audioPath;
    
  } catch (err) {
    console.error('❌ Audio generation failed:', err.message);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    console.log('🌅 Generating intelligent morning briefing...\n');
    
    // Generate briefing text
    const briefingText = await generateIntelligentBriefing();
    
    console.log('📝 Briefing text:');
    console.log(briefingText);
    console.log('\n');
    
    // Convert to audio
    console.log('🔊 Converting to audio...');
    const audioPath = await convertToAudio(briefingText, today);
    
    if (audioPath) {
      console.log(`✅ Audio ready: ${audioPath}`);
      
      // Log success
      await success(
        'morning-briefing',
        'Daily Briefing Generated',
        'Intelligent briefing with strategic insights',
        {
          audioFile: audioPath,
          textLength: briefingText.length,
          includesQuestions: briefingText.includes('Questions')
        }
      );
      
      // Send audio via WhatsApp (TTS tool already delivers it)
      // Then send follow-up text summary
      console.log('\n📱 Sending text summary to WhatsApp...');
      const summaryCmd = `openclaw message send --channel whatsapp --target +50662163355 --message "🌅 Morning Briefing Summary:\\n\\n${briefingText.substring(0, 500)}${briefingText.length > 500 ? '...' : ''}\\n\\n🔧 Full audio delivered above."`;
      
      try {
        execSync(summaryCmd, { stdio: 'inherit' });
        console.log('✅ Briefing sent successfully!');
      } catch (sendErr) {
        console.error('❌ Failed to send WhatsApp message:', sendErr.message);
        await logError('morning-briefing', 'WhatsApp Send Failed', sendErr);
      }
      
    } else {
      console.log('⚠️ Audio generation failed, sending text only');
      
      await logError(
        'morning-briefing',
        'Audio Generation Failed',
        'Falling back to text-only delivery'
      );
      
      // Send text-only briefing via WhatsApp
      console.log('\n📱 Sending text briefing to WhatsApp...');
      const textSendCmd = `openclaw message send --channel whatsapp --target +50662163355 --message "🌅 Morning Briefing (Text Only):\\n\\n${briefingText.replace(/"/g, '\\"')}"`;
      
      try {
        execSync(textSendCmd, { stdio: 'inherit' });
        console.log('✅ Text briefing sent!');
      } catch (sendErr) {
        console.error('❌ Failed to send text:', sendErr.message);
        console.log('\n📝 Text briefing:');
        console.log(briefingText);
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    await logError('morning-briefing', 'Briefing Generation Failed', err);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}

export { generateIntelligentBriefing };
