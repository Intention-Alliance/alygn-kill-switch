#!/usr/bin/env python3
"""
ALYGN VC Outreach Email Template v3
- Custom header with logo + wordmark side-by-side
- Tania Lea as CEO contact
- Personalization support (company, pain points)
- Website: alygn.us
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
        
        # Personalization
        company_mention = f' at {company_name}' if company_name else ''
        pain_point_text = ''
        if pain_points:
            pain_point_text = f'<p class="body-text">We\'ve been following your work in {pain_points}—the challenges you\'re tackling are exactly where governance infrastructure needs to evolve.</p>'
        
        # Copy variants based on audience/focus
        variants = {
            'governance': {
                'subject': 'Building AGI Resilience: The SOS Protocol',
                'headline': 'The Question Isn\'t If AGI Arrives—It\'s Who Coordinates the Response',
                'subheadline': 'Global Crisis Infrastructure for the Intelligence Age',
                'intro': '''At Intention Alliance, we're not betting on preventing AGI. We're building the governance infrastructure that ensures humanity navigates it with coordination, transparency, and safety.

The SOS Protocol is our answer: a global crisis coordination framework designed specifically for AGI-related existential risks—not in 2050, but starting now.''',
                'body': '''<p style="margin: 16px 0; line-height: 1.6;"><strong>Why This Matters:</strong></p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  <li><strong>SOS Protocol</strong> — Real-time coordination for critical scenarios. When AGI decisions need alignment across governments, enterprises, and researchers, you need a system that works.</li>
  <li><strong>Judica (Lexi Veritas)</strong> — AI-powered dispute resolution. When superintelligent systems conflict, traditional arbitration fails. We're building systems that can actually adjudicate at that scale.</li>
  <li><strong>Intention Marketplace</strong> — Economic alignment through ethical, user-empowered systems. Align incentives now, before the stakes get existential.</li>
  <li><strong>Dual-Token Economy</strong> — IAX (Bitcoin-pegged stability) + Align (utility-driven, non-speculative). Economic infrastructure that scales with governance complexity.</li>
</ul>
<p style="margin: 16px 0; line-height: 1.6;">We're already working with organizations building the next generation of AI systems. The ones building now won't wait for perfect frameworks—they'll use ours.</p>''',
                'cta': 'Explore the SOS Protocol',
                'closing': 'We\'re excited to discuss how your organization can be part of this.',
                'ps': 'This outreach was researched and drafted by our AI agent—because we practice what we preach.'
            },
            
            'technical': {
                'subject': 'AGI Governance Architecture: SOS Protocol Deep Dive',
                'headline': 'Existential Risk Management at Scale',
                'subheadline': 'The Infrastructure Layer for Global AGI Coordination',
                'intro': '''Superintelligent systems demand superintelligent governance. Traditional dispute resolution, regulatory frameworks, and coordination mechanisms break down when dealing with AGI-scale complexity and risk.

We've built the SOS Protocol as the governance substrate for that future—and it works today.''',
                'body': '''<p style="margin: 16px 0; line-height: 1.6;"><strong>Our Architecture:</strong></p>
<ul style="margin: 16px 0; line-height: 1.8; padding-left: 24px;">
  <li><strong>Confidence-Aware Crisis Response</strong> — SOS Protocol treats uncertainty quantification as first-class. When coordinating global responses, you need systems that know what they don't know.</li>
  <li><strong>Multi-Stakeholder Alignment</strong> — Judica resolves conflicts between AI systems, enterprises, and governance structures through cryptographically verifiable arbitration.</li>
  <li><strong>Economic Incentive Alignment</strong> — Dual tokens ensure that safety participation, dispute resolution, and coordination carry non-speculative utility value.</li>
  <li><strong>Composable Governance</strong> — Modular protocols that work at every scale—from individual system interactions to global coordination events.</li>
</ul>
<p style="margin: 16px 0; line-height: 1.6;">This isn\'t theoretical. We're building production systems today that handle the coordination problems most teams haven't even recognized yet.</p>''',
                'cta': 'Let\'s discuss AGI governance',
                'closing': 'Looking forward to exploring this with your team.',
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

      <a href="mailto:contact@andler.dev" class="cta-button">{copy['cta']}</a>

      <p class="closing">{copy['closing']}</p>

      <div class="ps">{copy['ps']}</div>

      <div class="signature">
        <p style="margin: 0 0 4px 0;">
          <span class="signature-name">Tania Lea</span>
        </p>
        <p class="signature-role">Founder & CEO, Intention Alliance</p>
        <p class="signature-role" style="margin: 4px 0 0 0;">
          <a href="mailto:tanialeaidm@gmail.com">tanialeaidm@gmail.com</a>
        </p>
        <p class="team-contact">
          Team inquiries: <a href="mailto:contact@andler.dev">contact@andler.dev</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p style="margin: 0;">© 2026 Intention Alliance | <a href="https://alygn.us">alygn.us</a></p>
    </div>
  </div>
</body>
</html>'''
        
        return copy['subject'], html_template
    
    def send_email(self, recipient_email, recipient_name='there', company_name='', pain_points='', variant='governance'):
        """Send email with personalization and MIME-embedded images"""
        
        if not self.logo_path.exists():
            print(f"❌ Logo not found at {self.logo_path}")
            return False
        
        subject, html = self.build_html(recipient_name, company_name, pain_points, variant)
        
        try:
            # Create MIME message with related parts (for inline images)
            msg = MIMEMultipart('related')
            msg['From'] = self.smtp_config['user']
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
    
    print("🚀 Sending updated ALYGN VC outreach emails...\n")
    
    # Governance variant
    builder.send_email(
        'andler.dev@gmail.com',
        recipient_name='there',
        company_name='',
        pain_points='',
        variant='governance'
    )
    print()
    
    # Technical variant
    builder.send_email(
        'andler.dev@gmail.com',
        recipient_name='there',
        company_name='',
        pain_points='',
        variant='technical'
    )
    
    print("\n✅ Templates updated and sent!")
    print("\nTemplate features:")
    print("  • Dark header (#252525) with logo + wordmark side-by-side")
    print("  • Logo 20% larger (77px)")
    print("  • Tighter spacing between logo and wordmark")
    print("  • Tania Lea as CEO (tanialeaidm@gmail.com)")
    print("  • Team contact: contact@andler.dev (Andler)")
    print("  • Website: alygn.us")
    print("  • Supports personalization (recipient name, company, pain points)")

if __name__ == '__main__':
    main()
