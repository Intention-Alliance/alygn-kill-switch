# Andler.dev Content Creation Protocol

**Purpose:** Developer Advocate content creation for @andler.dev personal brand  
**Audience:** CTOs, Tech Founders, Engineering Leaders  
**Tone:** Direct, technical, lean startup pragmatism  

---

## 🎯 Content Types

### 1. X/Twitter Threads
- 7-8 posts max
- Hook-driven first post
- Value-focused, not self-promotional
- Hashtags: 3-5 max, end of thread
- Format: `[content]\n\n[hashtags]`
- **Assets:** 1-2 images/GIFs per thread (engagement boost)

### 2. LinkedIn Long-Form
- Headline + structured body
- No emoji overload (professional)
- Engagement question at end
- Hashtags: 5-8 relevant tags
- **Assets:** 1 featured image + optional diagram

### 3. Markdown Blog Tutorials
- 1500-3000 words
- Technical depth with diagrams
- Implementation details (sanitized)
- Tradeoffs section (honest about limitations)
- Call-to-action for follow-up content
- **Assets: 1-7 per blog** (depending on content/length):
  - 1 blog portrait (featured image, 1200x630px)
  - Architecture diagrams
  - Flow charts / sequence diagrams
  - Comparison infographics
  - GIFs/memes for engagement (young/tech-savvy audience)
  - Code snippet visuals (when applicable)

**Infographic Style:** Infobae-inspired visual journalism
- Clean, bold data visualization
- High contrast colors for impact
- Clear hierarchy (headline → key stat → supporting data)
- Minimal text, maximum visual communication
- Modern sans-serif typography
- Iconography that tells the story at a glance
- Reference: infobae.com/tag/infografias/

---

## 🔒 Security Sanitization (MANDATORY)

**Before publishing, remove:**

- ❌ Port numbers (11435, 11436, 11434, etc.)
- ❌ Specific config names (OLLAMA_KEEP_ALIVE, proxy_buffering)
- ❌ Brand/product names in security-critical contexts (use generic terms)
- ❌ Internal file paths
- ❌ API endpoints or URLs
- ❌ Credentials or auth details

**Replace with:**

- ✅ Generic terms ("reverse proxy" instead of "Nginx")
- ✅ Conceptual descriptions ("identity-bound access" instead of "Tailscale + Google Workspace")
- ✅ Architecture patterns without implementation specifics

**Test:** Could someone attack our infrastructure using only this post? If yes, sanitize more.

---

## 📝 Beautiful Prose Rules (LinkedIn + Blog)

**Apply these constraints:**

### Absolute Prohibitions
- ❌ Em dashes (—) use periods, commas, colons, semicolons
- ❌ "It's not X, it's Y" constructions
- ❌ Filler transitions ("at its core", "that said", "ultimately", "in today's world")
- ❌ Therapy language ("I hear you", "this is hard", "give yourself grace")
- ❌ AI meta-talk ("this essay explores", "we will discuss", "key takeaways")

### Positive Constraints
- ✅ Declarative sentences
- ✅ Vary length aggressively (short sentences as impact)
- ✅ Concrete nouns over abstractions
- ✅ Strong verbs over adverbs
- ✅ Paragraphs breathe (white space is intentional)
- ✅ Open with substance, close cleanly

**Quality check:** Remove any line that sounds templated. Silence beats slop.

---

## 🐦 X/Growth Format Rules

### Thread Structure
1. **Hook** — Problem/constraint statement
2. **Context** — Why this matters
3. **Solution** — Architecture/approach (3-4 posts)
4. **Results** — Metrics/outcomes
5. **Takeaway** — Actionable insight

### Hashtag Strategy
- Primary: `#AIInfrastructure #ZeroTrust #StartupEngineering`
- Secondary: `#LLM #DevOps #CloudSecurity #OpenSource #CTO`
- Placement: End of thread (last post) OR end of each post (consistent)

### Engagement Pattern
- Post during peak hours (10 AM - 12 PM CST)
- Engage with replies in first 2 hours
- Cross-post to relevant communities (Reddit, HackerNews)
- Follow up with blog tutorial link in comments

---

## 📂 File Organization

```
docs/developer-advocate/
├── social/
│   ├── zero-trust-ai-infrastructure-social.md  # X thread + LinkedIn
│   └── [topic]-social.md
├── blog/
│   ├── zero-trust-ai-infrastructure-tutorial.md  # Full markdown blog
│   └── [topic]-tutorial.md
└── assets/
    ├── portraits/  # Blog featured images (1200x630px)
    ├── diagrams/   # Architecture diagrams, flow charts
    ├── infographics/  # Comparisons, metrics visuals
    └── gifs/       # Engagement GIFs/memes (tech-savvy)
```

**Asset naming convention:**
- `YYYY-MM-DD-[topic]-[type]-[variant].png`
- Example: `2026-04-13-zero-trust-portrait.png`
- Example: `2026-04-13-zero-trust-architecture-diagram.png`
- Example: `2026-04-13-zero-trust-cloud-vs-local-meme.gif`

---

## 🚀 Workflow

### Step 1: Source Material
- Internal ADRs, architecture docs, technical decisions
- Identify what's safe to share publicly
- **Identify asset opportunities** (diagrams, infographics, portraits)

### Step 2: Blog Tutorial (First)
- Write full technical deep-dive
- Include ASCII diagrams as placeholders
- Mark asset insertion points: `[ASSET: description]`
- Save to `docs/developer-advocate/blog/`

### Step 3: Asset Generation (MANDATORY)
- **Blog portrait** (1200x630px, minimalist, modern)
- **Architecture diagrams** (polished, sharp, color-coded)
- **Flow charts** (sequence, data flow, decision trees)
- **Comparison infographics** (Infobae style: bold, high-contrast, data-driven)
- **GIFs/memes** (1-2 max, tech-savvy audience, relevant humor)
- **Style:** Polished, minimalist, sharp, modern
- **Infographic inspiration:** Infobae visual journalism (clean, bold, high-contrast)
- **Color palette:** Consistent with andler.dev brand
- Save to `docs/developer-advocate/assets/`

### Step 4: Social Content
- Extract key insights from blog
- Create X thread (hook-driven, concise)
- Create LinkedIn post (long-form, professional)
- Save to `docs/developer-advocate/social/`

### Step 5: Review
- Security sanitization check
- Tone alignment (andler.dev voice)
- Beautiful Prose compliance (LinkedIn/blog)
- X/Growth format compliance (thread structure)
- **Asset quality check** (clarity, aesthetics, relevance)

### Step 6: Publish
- Blog first (if platform ready) with all assets embedded
- X thread during peak hours (with images/GIFs)
- LinkedIn same day or next morning (with featured image)
- Engage with comments promptly

---

## 🎨 Tone Guidelines

### andler.dev Voice
- **Direct** — no fluff, get to the point
- **Technical** — assume audience is sophisticated
- **Pragmatic** — lean startup constraints, real tradeoffs
- **Honest** — admit limitations, don't oversell
- **Teaching** — share lessons, not just wins

### What to Avoid
- ❌ Marketing speak ("revolutionary", "game-changing")
- ❌ Humble-bragging ("just a simple...")
- ❌ Over-explaining basics (audience is CTOs)
- ❌ Self-promotion without value
- ❌ Generic advice ("work hard", "stay focused")

### What to Embrace
- ✅ Specific numbers (costs, performance, timelines)
- ✅ Architecture diagrams
- ✅ Code snippets (when relevant)
- ✅ Tradeoff discussions
- ✅ "Here's what I'd do differently"

---

## 📊 Success Metrics

**Track:**
- Engagement rate (likes, comments, shares)
- Follower growth (weekly)
- Blog traffic (when live)
- Inbound opportunities (speaking, consulting, partnerships)

**Review:**
- Weekly: Which posts performed best?
- Monthly: Adjust content mix
- Quarterly: Set new growth goals

---

## 🧠 Content Correlation Matrix

**Map technical work to content angles:**

| Technical Work | Content Angle | Audience Hook |
|----------------|---------------|---------------|
| Local LLM infra | Cost savings + sovereignty | "Zero API costs, 100% control" |
| Zero-Trust networking | Security on budget | "Enterprise security, startup spend" |
| Agent automation | Operational resilience | "24/7 uptime without cloud dependency" |
| RAG pipeline | Technical deep-dive | "How we fixed [specific bug]" |
| Monitoring/observability | DevOps best practices | "What we monitor and why" |

**Correlation Test:**
- ✅ Does this teach something actionable?
- ✅ Does this show clever engineering?
- ✅ Does this demonstrate lean startup pragmatism?
- ✅ Would a CTO/Founder find this useful?

If YES to 2+ questions → Create content

---

## ✅ Quality Checklist (Pre-Publish)

**Security:**
- [ ] No ports, IPs, or endpoints exposed
- [ ] No brand names in security-critical contexts
- [ ] No internal paths or credentials
- [ ] Could not be used to attack our infrastructure

**Tone:**
- [ ] Direct, no marketing fluff
- [ ] Technical but accessible
- [ ] Honest about tradeoffs
- [ ] Teaching mindset (not bragging)

**Format:**
- [ ] X thread: Hook → Context → Solution → Results → Takeaway
- [ ] LinkedIn: Headline → Structured body → Engagement question
- [ ] Blog: 1500-3000 words, diagrams, tradeoffs section
- [ ] Hashtags: Proper placement, 3-8 max

**Beautiful Prose (LinkedIn/Blog):**
- [ ] No em dashes
- [ ] No "not X but Y" constructions
- [ ] No filler transitions
- [ ] Varied sentence length
- [ ] Concrete over abstract

**Assets (MANDATORY):**
- [ ] Blog portrait generated (1200x630px, minimalist, modern)
- [ ] Architecture diagrams polished (not ASCII)
- [ ] 1-7 assets total (appropriate for content length)
- [ ] GIFs/memes relevant to tech-savvy audience (1-2 max)
- [ ] All assets sanitized (no sensitive info in visuals)
- [ ] Infographics follow Infobae style (bold, high-contrast, data-driven, minimal text)

---

**Created:** 2026-04-13  
**Status:** Active  
**Maintained by:** Wobblus 🔧  
**Trigger:** @andler.dev content creation requests
