#!/usr/bin/env python3
"""
ALYGN VC Outreach Email Template v4 - Governance-First
- Independent AI governance institution positioning
- Institutional restraint and neutral tone
- No product claims, no hype
- Focus: coordination, legitimacy, preparedness
- Updated: Feb 10, 2026 (context update)
"""

import json
import os
import smtplib
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path


class ALYGNEmailBuilder:
    def __init__(self):
        self.logo_path = Path.home() / 'Downloads' / 'avatar_400x400.jpg'
        # Load SMTP credentials from config/credentials.json

        credentials_path = Path.home() / '.openclaw' / 'workspace' / 'config' / 'credentials.json'
        with open(credentials_path, 'r') as f:
            creds = json.load(f)
        email_creds = creds['email']['smtp']
        self.smtp_config = {
            'server': email_creds['server'],
            'port': email_creds['port'],
            'user': creds['email']['address'],
            'password': email_creds['password']
        }
    
    def build_html(self, recipient_name='there', company_name='', pain_points='', variant='governance'):
        """Build HTML email template with personalization"""
        
        # Build mailto: template for this variant
        mailto_template = self.build_mailto_template(variant)
        mailto_subject = mailto_template['subject'].replace(' ', '%20')
        mailto_body = mailto_template['body'].replace('\n', '%0A').replace(' ', '%20')
        mailto_link = f"mailto:tanialeaidm@gmail.com?subject={mailto_subject}&body={mailto_body}"
        
        # Personalization
        company_mention = f' at {company_name}' if company_name else ''
        pain_point_text = ''
        if pain_points:
            pain_point_text = f'<p class="body-text">Your work in {pain_points} represents exactly the kind of institutional challenge where coordination infrastructure matters most.</p>'
        
        # Copy variants based on audience/focus
        variants = {
            'governance': {
                'subject': 'AI Governance Infrastructure',
                'headline': 'Coordination Before Crisis',
                'subheadline': 'Independent AI Governance for Global-Scale Systems',
                'intro': '''Alygn is an independent AI governance institution focused on making accountability, oversight, and coordination workable for advanced AI systems operating at global scale.

As AI systems outgrow individual actors, governance can't be retrofitted. We exist to support coordination across developers, operators, and public institutions—without centralizing control or asserting authority.''',
                'body': '''<p style="margin: 16px 0; line-height: 1.6;"><strong>Why This Matters:</strong></p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  <li><strong>Governance legitimacy, not technology.</strong> The hardest AI risks are institutional, not technical. Coordination failure is the real systemic risk.</li>
  <li><strong>Pre-crisis preparation.</strong> Emergency response that doesn't exist before crisis rarely works during one. Institutions are slow to build and expensive to replace.</li>
  <li><strong>Institutional restraint.</strong> We enable accountability through neutral infrastructure—not by regulating, controlling, or claiming authority over systems.</li>
  <li><strong>Independence matters.</strong> Oversight only works if all sides believe it's fair. Trust is harder to scale than technology.</li>
</ul>
<p style="margin: 16px 0; line-height: 1.6;">Alygn is publicly forming to address the institutional gap in AI governance before urgency removes options. We're building for legitimacy and durability, not speed or visibility.</p>''',
                'cta': 'Learn more about Alygn',
                'closing': 'We\'re interested in exploring how governance infrastructure can support your organization\'s work.',
                'ps': 'This outreach was researched and drafted by our AI agent—because we practice what we preach.'
            },
            
            'institutional': {
                'subject': 'Institutional AI Governance',
                'headline': 'The Real AI Risk is Coordination Failure',
                'subheadline': 'Neutral Governance Infrastructure for Advanced Systems',
                'intro': '''When AI systems scale beyond individual control, coordination becomes the bottleneck. Traditional oversight breaks down when no single actor can credibly intervene alone.

Alygn is an independent institution focused on making accountability, emergency response, and cross-organization coordination actually work—before crisis conditions force fragmented outcomes.''',
                'body': '''<p style="margin: 16px 0; line-height: 1.6;"><strong>Core Principles:</strong></p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  <li><strong>Governance-first, not technology-first.</strong> Our value proposition is legitimacy, not technical systems. Any infrastructure exists only in service of coordination.</li>
  <li><strong>Separation of concerns.</strong> Clear boundaries between governance, oversight, and system operation. We support coordination—we don't control systems.</li>
  <li><strong>Independent review.</strong> Neutral frameworks are easier to challenge but harder to dismiss. Independence is insulation from capture.</li>
  <li><strong>Emergency coordination without standing control.</strong> Preparedness is about permission, not prediction. Crisis frameworks designed during crisis reflect panic, not judgment.</li>
</ul>
<p style="margin: 16px 0; line-height: 1.6;">The absence of trusted coordination mechanisms is itself a systemic risk. We're addressing this gap deliberately, with institutional restraint rather than claims of authority.</p>''',
                'cta': 'Discuss institutional coordination',
                'closing': 'Looking forward to exploring this with you.',
                'ps': 'This outreach was researched and drafted by our AI agent—because we practice what we preach.'
            }
        }
        
        copy = variants.get(variant, variants['governance'])
        
        html_template = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{copy['subject']}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background-color: #f9fafb;
      margin: 0;
      padding: 0;
      color: #1f2937;
    }}
    .container {{
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }}
    .header {{
      background-color: rgb(25, 25, 25);
      padding: 32px 24px;
      text-align: center;
    }}
    .header-brand {{
      margin: 0 auto;
      display: inline-block;
    }}
    .brand-name {{
      font-size: 32px;
      font-weight: 900;
      color: #ffffff;
      margin: 0 11px 0 0;
      letter-spacing: 0.5px;
      line-height: 1;
      display: inline-block;
      vertical-align: middle;
    }}
    .logo {{
      width: 94px;
      height: 94px;
      border-radius: 8px;
      display: inline-block;
      vertical-align: middle;
      margin: 0;
    }}
    .content {{
      padding: 32px 24px;
    }}
    .headline {{
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 8px 0;
      line-height: 1.2;
    }}
    .subheadline {{
      font-size: 16px;
      color: #64748b;
      margin: 0 0 24px 0;
      font-weight: 500;
    }}
    .greeting {{
      font-size: 16px;
      color: #1f2937;
      margin: 0 0 16px 0;
      font-weight: 500;
    }}
    .body-text {{
      font-size: 15px;
      line-height: 1.6;
      color: #374151;
    }}
    .body-text p {{
      margin: 16px 0;
    }}
    .body-text ul {{
      margin: 16px 0;
      padding-left: 24px;
      line-height: 1.8;
    }}
    .body-text li {{
      margin: 8px 0;
    }}
    .body-text strong {{
      color: #0f172a;
    }}
    .cta-button {{
      display: inline-block;
      background-color: #0f172a;
      color: #ffffff !important;
      padding: 12px 32px;
      border-radius: 6px;
      text-decoration: none !important;
      font-weight: 500;
      font-size: 16px;
      margin: 24px 0;
      border: 1px solid #0f172a;
      cursor: pointer;
    }}
    .cta-button:hover {{
      background-color: #1e293b;
      border-color: #1e293b;
    }}
    .closing {{
      margin: 24px 0 0 0;
      font-size: 15px;
      color: #374151;
    }}
    .ps {{
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
      font-style: italic;
    }}
    .signature {{
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      font-size: 14px;
      color: #6b7280;
    }}
    .signature-name {{
      font-weight: 600;
      color: #1f2937;
    }}
    .signature a {{
      color: #0f172a;
      text-decoration: none;
    }}
    .signature-role {{
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }}
    .team-contact {{
      margin-top: 12px;
      font-size: 13px;
      color: #9ca3af;
    }}
    .footer {{
      background-color: #f3f4f6;
      padding: 24px;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
    }}
    .footer a {{
      color: #0f172a;
      text-decoration: none;
      font-weight: 500;
    }}
    .footer a:hover {{
      text-decoration: underline;
    }}
  </style>
</head>
<body>
  <div class="container">
    <!-- Header with Logo + Wordmark -->
    <div class="header">
      <div class="header-brand">
        <h2 class="brand-name">ALYGN</h2>
        <img src="cid:logo" alt="ALYGN Logo" class="logo">
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <h1 class="headline">{copy['headline']}</h1>
      <p class="subheadline">{copy['subheadline']}</p>

      <p class="greeting">Hi {recipient_name},</p>

      {pain_point_text}

      <p class="body-text">{copy['intro']}</p>

      <div class="body-text">{copy['body']}</div>

      <a href="{mailto_link}" class="cta-button">{copy['cta']}</a>

      <p class="closing">{copy['closing']}</p>

      <div class="ps">{copy['ps']}</div>

      <div class="signature">
        <p style="margin: 0 0 4px 0;">
          <span class="signature-name">Tania Lea</span>
        </p>
        <p class="signature-role">Founder & CEO, Alygn</p>
        <p class="signature-role" style="margin: 4px 0 0 0;">
          <a href="{mailto_link}">tanialeaidm@gmail.com</a>
        </p>
        <p class="team-contact">
          Team inquiries: <a href="mailto:contact@andler.dev">contact@andler.dev</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p style="margin: 0 0 12px 0;">© 2026 Alygn</p>
      <p style="margin: 0; font-size: 14px;">
        <a href="https://alygn.us?utm_source=email&utm_medium=vc-outreach&utm_campaign={variant}" style="display: inline-block; margin: 0 8px;">🌐 alygn.us</a> | 
        <a href="https://x.com/aialygn?utm_source=email&utm_medium=vc-outreach&utm_campaign={variant}" style="display: inline-block; margin: 0 8px;">𝕏 @aialygn</a> | 
        <a href="https://linkedin.com/company/alygn?utm_source=email&utm_medium=vc-outreach&utm_campaign={variant}" style="display: inline-block; margin: 0 8px;">💼 LinkedIn</a>
      </p>
    </div>
  </div>
</body>
</html>'''
        
        return copy['subject'], html_template
    
    def build_mailto_template(self, variant='governance'):
        """Build pre-filled mailto: templates for different variants"""
        templates = {
            'governance': {
                'subject': 'Re: AI Governance Infrastructure',
                'body': 'Hi Tania,\n\nI\'m interested in learning more about Alygn\'s approach to coordination infrastructure and how it applies to our work.\n\nLet\'s schedule a time to discuss.\n\nBest regards'
            },
            'institutional': {
                'subject': 'Re: Institutional AI Governance',
                'body': 'Hi Tania,\n\nYour approach to neutral governance infrastructure and emergency coordination resonates with our challenges. I\'d like to explore this further.\n\nLooking forward to connecting.\n\nBest regards'
            }
        }
        return templates.get(variant, templates['governance'])
    
    def send_email(self, recipient_email, recipient_name='there', company_name='', pain_points='', variant='governance'):
        """Send email with personalization and MIME-embedded images"""
        
        if not self.logo_path.exists():
            print(f"❌ Logo not found at {self.logo_path}")
            return False
        
        subject, html = self.build_html(recipient_name, company_name, pain_points, variant)
        
        try:
            # Create MIME message with related parts (for inline images)
            msg = MIMEMultipart('related')
            msg['From'] = 'Alygn R&D <admin@alygn.us>'
            msg['To'] = recipient_email
            msg['Subject'] = subject
            
            # Alternative part for fallback text
            msg_alternative = MIMEMultipart('alternative')
            msg.attach(msg_alternative)
            msg_alternative.attach(MIMEText(html, 'html'))
            
            # Attach logo as inline image
            with open(self.logo_path, 'rb') as f:
                img = MIMEImage(f.read(), 'jpeg')
                img.add_header('Content-ID', '<logo>')
                img.add_header('Content-Disposition', 'inline', filename='logo.jpg')
                msg.attach(img)
            
            # Send email
            server = smtplib.SMTP(self.smtp_config['server'], self.smtp_config['port'])
            server.starttls()
            server.login(self.smtp_config['user'], self.smtp_config['password'])
            server.send_message(msg)
            server.quit()
            
            print(f"✅ Email sent to {recipient_email}")
            print(f"   Recipient: {recipient_name}")
            if company_name:
                print(f"   Company: {company_name}")
            if pain_points:
                print(f"   Pain points: {pain_points}")
            print(f"   Variant: {variant}")
            return True
        
        except Exception as e:
            print(f"❌ Failed to send email: {str(e)}")
            return False

def main():
    builder = ALYGNEmailBuilder()
    
    print("🚀 Sending updated ALYGN VC outreach emails (Governance-First v4)...\n")
    
    # Governance variant
    builder.send_email(
        'tanialeaidm@gmail.com',
        recipient_name='there',
        company_name='',
        pain_points='',
        variant='governance'
    )
    print()
    
    # Institutional variant
    builder.send_email(
        'tanialeaidm@gmail.com',
        recipient_name='there',
        company_name='',
        pain_points='',
        variant='institutional'
    )
    
    print("\n✅ Templates updated and sent (Governance-First v4)!")
    print("\nKey changes from v3:")
    print("  • Removed 'Intention Marketplace' reference")
    print("  • Governance-first positioning (not SOS Protocol)")
    print("  • Institutional restraint tone (calm, non-promotional)")
    print("  • Language: 'Supports coordination', not 'Regulates'")
    print("  • Focus: Legitimacy, preparedness, coordination")
    print("  • LinkedIn URL kept (logo/banners updated)")

if __name__ == '__main__':
    main()
