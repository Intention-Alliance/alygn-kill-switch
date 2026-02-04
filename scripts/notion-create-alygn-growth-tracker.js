#!/usr/bin/env node

const NOTION_KEY = "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";
const NOTION_VERSION = "2022-06-28";
const IA_HUB_PAGE_ID = "2f9334874af6819fa5c5f32ae95088f1";

async function notionRequest(endpoint, method = "GET", body = null) {
  const url = `https://api.notion.com/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      "Authorization": `Bearer ${NOTION_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Notion API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createALYGNGrowthTracker() {
  console.log("🚀 Creating ALYGN Growth Tracker in Notion...\n");

  // 1. Create main page
  const mainPage = await notionRequest("pages", "POST", {
    parent: { page_id: IA_HUB_PAGE_ID },
    properties: {
      title: {
        title: [{ text: { content: "ALYGN Growth Strategy Tracker" } }]
      }
    },
    icon: { emoji: "🚀" }
  });

  console.log("✅ Main page created:", mainPage.url);

  // 2. Add intro content
  await notionRequest(`blocks/${mainPage.id}/children`, "PATCH", {
    children: [
      {
        object: "block",
        type: "heading_1",
        heading_1: {
          rich_text: [{ text: { content: "Overview" } }]
        }
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{
            text: {
              content: "Comprehensive growth strategy for @aialygn combining VC outreach and Twitter/X automation. Target: 5K relevant followers in 3 months + pre-seed funding."
            }
          }]
        }
      },
      {
        object: "block",
        type: "divider",
        divider: {}
      }
    ]
  });

  // 3. Create VC Outreach Strategy subpage
  const vcPage = await notionRequest("pages", "POST", {
    parent: { page_id: mainPage.id },
    properties: {
      title: {
        title: [{ text: { content: "VC Outreach Strategy" } }]
      }
    },
    icon: { emoji: "💼" }
  });

  console.log("✅ VC Outreach page created:", vcPage.url);

  // Add VC content
  await notionRequest(`blocks/${vcPage.id}/children`, "PATCH", {
    children: [
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: "Top 8 VCs for AI Safety (2026)" } }]
        }
      },
      {
        object: "block",
        type: "callout",
        callout: {
          icon: { emoji: "⭐" },
          rich_text: [{
            text: {
              content: "Key Insight: $1.7B+ invested in AI trust/risk startups. Focus on governance and ethical AI alignment."
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "1. Menlo Ventures ⭐ TOP PRIORITY" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Focus: Co-manages $100M Anthology Fund with Anthropic" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $5M–$100M (early to growth)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Thesis: 'Reliable, interpretable, steerable AI systems'" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Key Investments: Anthropic ($7.3B+), Pinecone, agentic AI tools" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "2. Sequoia Capital" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $10M–$100M (Series A–D)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Key Investments: OpenAI, Anthropic, Databricks, xAI" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "3. Andreessen Horowitz (a16z)" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $500K–$40M (seed to Series B)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Focus: Ethical AI and regulatory compliance" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "4. Lightspeed Venture Partners" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $1M–$50M (seed to Series C)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "23 AI deals in 2024–2025 with minimal-risk governance focus" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "5. Khosla Ventures" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $1M–$25M (seed to Series A)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Focus: Ethical constraints and sustainability" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "6. Bessemer Venture Partners" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $2M–$50M (early stages)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Active in AI TRiSM (Trust, Risk, Security Management)" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "7. Insight Partners" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $10M–$100M (growth stages)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Prioritizes EU AI Act compliance" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "8. Air Street Capital" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Check Size: $500K–$5M (seed)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Thesis-driven on ethical AI and risk-aware biology" }
          }]
        }
      }
    ]
  });

  // 4. Create Twitter/X Growth Strategy subpage
  const twitterPage = await notionRequest("pages", "POST", {
    parent: { page_id: mainPage.id },
    properties: {
      title: {
        title: [{ text: { content: "Twitter/X Growth Strategy" } }]
      }
    },
    icon: { emoji: "🐦" }
  });

  console.log("✅ Twitter/X Growth page created:", twitterPage.url);

  // Add Twitter content
  await notionRequest(`blocks/${twitterPage.id}/children`, "PATCH", {
    children: [
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: "19 Grok Prompts for Growth Automation" } }]
        }
      },
      {
        object: "block",
        type: "callout",
        callout: {
          icon: { emoji: "🎯" },
          rich_text: [{
            text: {
              content: "Target: 5K relevant followers in 3 months through ethical growth tactics"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "📝 Content Generation Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Generating Post Ideas: 'Generate 10 engaging thread ideas on AI alignment and safety topics that would appeal to researchers, developers, and enthusiasts on X. Make each idea concise, include key hooks for virality like questions or controversies, and suggest 3-5 points per thread to expand on.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Advanced Post Ideas with Visuals: 'Create 5 X post ideas focused on xAI's Grok model and its alignment challenges. For each, include a suggested poll question, a humorous twist, and recommendations for accompanying images or memes to boost engagement.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Niche-Specific Posts: 'Suggest 7 short-form X posts (under 280 characters each) about real-world AI alignment failures or successes, optimized for retweets in the AI ethics community. Include hashtags and calls to action like 'What do you think?''"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "💬 Reply Template Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "General Reply Starters: 'Craft 15 versatile reply templates for engaging in AI alignment discussions on X. Each should add value, such as a fact, question, or counterpoint, and end with a subtle invitation to follow @aialygn for more insights.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Debate-Oriented Replies: 'Generate 10 thoughtful reply templates for controversial AI topics like AGI risks. Make them balanced, cite a quick source or example, and encourage further conversation without being argumentative.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Personalized Replies: 'Based on this sample X post: [insert post text here], create 5 customized reply options that reference the post's key points, add a unique AI alignment angle, and tag relevant users to expand reach.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "🎯 Audience Targeting Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Identifying Key Accounts: 'List the top 25 X accounts in AI alignment, safety, and xAI-related topics, ranked by follower count and engagement rate. For each, suggest 2-3 interaction ideas like questions to reply with.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Community Mapping: 'Analyze and map out X communities around AI ethics and alignment. Provide 20 accounts to target for follows and engagements, grouped by sub-niches (e.g., researchers, startups, critics), with reasons why they're relevant to @aialygn.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "User Profile Analysis: 'Review the X profile of [insert username, e.g., @ylecun]. Suggest 5 ways to engage with their recent posts on AI topics, including draft replies that align with @aialygn's focus on alignment.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "🚀 Growth Tactics Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Overall Strategies: 'Outline 8 ethical, rapid growth tactics for an X account focused on AI alignment, starting from under 1K followers. Include daily action plans, tools needed, and metrics to track progress toward 5K followers in 3 months.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Virality Optimization: 'Provide strategies to make X content on AI safety go viral. Include tips on timing, formatting, cross-promotion, and A/B testing ideas for posts generated by Grok.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Collaboration Ideas: 'Suggest 10 ways to collaborate with other AI X accounts, such as co-hosting Spaces or quote-tweeting. Focus on tactics that could double @aialygn's relevant followers in a month.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "📊 Trend Analysis Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Daily Trends: 'Search and summarize today's top X trends in AI alignment, including keywords like 'AGI safety' or 'xAI'. Suggest 5 reply ideas to the most engaging posts, tailored for @aialygn.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Keyword-Based Insights: 'Analyze recent X conversations around 'AI alignment risks'. List 10 high-engagement posts from the last week, and generate draft replies for each that position @aialygn as an expert.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "🤖 Automation Support Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Reply Automation: 'Generate a batch of 20 automated reply prompts for ClawdBot to use on AI threads. Each should be a template like: 'Insightful point on [topic]! Here's how alignment could help: [brief explanation]. Follow @aialygn for more.''"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Scheduling Content: 'Create a 7-day content calendar for @aialygn with Grok-generated posts. Include themes, post types (threads, polls, quotes), and optimal posting times for tech audiences.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "📈 Tracking & Optimization Prompts" } }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Analytics Review: 'Analyze this X analytics data: [insert data like follower growth, impressions, top posts]. Suggest 5 optimizations to accelerate relevant follower growth, focusing on AI alignment engagement.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Performance Feedback: 'Based on last week's engagements (e.g., 50 replies, 200 new follows), recommend adjustments to my Grok prompts and ClawdBot scripts to aim for 100 weekly follows.'"
            }
          }]
        }
      },
      {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{
            text: {
              content: "Long-Term Scaling: 'Project a 6-month growth plan for @aialygn using Grok and ClawdBot. Include milestone prompts for content refreshes and new tactics every month.'"
            }
          }]
        }
      }
    ]
  });

  // 5. Create Implementation Plan subpage
  const implPage = await notionRequest("pages", "POST", {
    parent: { page_id: mainPage.id },
    properties: {
      title: {
        title: [{ text: { content: "Implementation Plan & Cron Schedule" } }]
      }
    },
    icon: { emoji: "⚙️" }
  });

  console.log("✅ Implementation Plan page created:", implPage.url);

  // Add implementation content
  await notionRequest(`blocks/${implPage.id}/children`, "PATCH", {
    children: [
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: "Recommended ClawdBot Cron Schedule" } }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Daily Jobs" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "9:00 AM - Thread idea generation (Prompt #1)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "6:00 PM - Daily analytics check (Prompt #17)" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Recurring Jobs (Every X Hours)" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Every 6 hours - Trend monitoring (Prompt #13)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Every 2 hours - Automated engagement (Prompts #14, #15)" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Weekly Jobs" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Monday 10:00 AM - Niche post generation (Prompt #3)" }
          }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "Sunday 5:00 PM - Weekly performance review (Prompt #18)" }
          }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Monthly Jobs" } }]
        }
      },
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{
            text: { content: "1st of month, 9:00 AM - Strategy update (Prompt #19)" }
          }]
        }
      },
      {
        object: "block",
        type: "divider",
        divider: {}
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ text: { content: "Implementation Phases" } }]
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Phase 1: Setup (Week 1)" } }]
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Run Prompt #7 - Identify top 25 key accounts" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Run Prompt #8 - Map communities (20 accounts)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Run Prompt #16 - Create 7-day content calendar" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Generate reply templates (Prompts #4, #5)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Phase 2: Daily Automation (Ongoing)" } }]
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Morning: Run trend analysis (Prompt #13)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Midday: Personalized engagement (Prompt #6)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Evening: Track analytics (Prompt #17)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ text: { content: "Phase 3: Scale (Month 2-3)" } }]
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Weekly: Adjust strategy (Prompt #18)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Monthly: Long-term planning (Prompt #19)" } }],
          checked: false
        }
      },
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ text: { content: "Execute collaborations (Prompt #12)" } }],
          checked: false
        }
      }
    ]
  });

  console.log("\n🎉 ALYGN Growth Tracker created successfully!");
  console.log("\n📋 Summary:");
  console.log("  Main page:", mainPage.url);
  console.log("  VC Outreach:", vcPage.url);
  console.log("  Twitter/X Growth:", twitterPage.url);
  console.log("  Implementation Plan:", implPage.url);
  
  return {
    mainPage: mainPage.url,
    vcPage: vcPage.url,
    twitterPage: twitterPage.url,
    implPage: implPage.url
  };
}

createALYGNGrowthTracker().catch(console.error);
