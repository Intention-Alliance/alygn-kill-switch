# Context Engineering - Key Notes

**Source:** `context-engineering-guide.pdf`

## Core Concept
**Context Engineering** is the discipline of designing the architecture that feeds an LLM the right information at the right time. It's not about changing the model itself, but building bridges that connect it to the outside world.

## The Fundamental Problem
- **The Context Window Challenge:** LLMs have a finite working memory (context window)
- Like a whiteboard — once full, older information gets erased
- LLMs are "powerful but isolated brains" without access to:
  - Your specific data
  - Live internet
  - Memory of past conversations

## Core Components

### 1. Agents
- **Query Agents** — handling user queries
- **Agentic coordination & decision making**

### 2. Query Augmentation
- **Query Rewriting**
- **Query Expansion**
- **Query Decomposition**

### 3. Retrieval
- **Vector search (retrieval)**
- **RAG (Retrieval-Augmented Generation)**
- Databases

### 4. Memory Systems
- **Short-Term Memory:** Store context in chat history
- **Long-Term Memory:** Add to persistent memory
- Key Principles for Effective Memory Management

### 5. Chunking Strategies
- Simple Chunking Strategies
- Advanced Chunking Strategies
- Pre-Chunking vs. Post-Chunking

### 6. Prompting Techniques
- Classic Prompting Techniques
- Advanced Prompting Techniques
- Prompting for Tool Usage
- Using Prompt Frameworks

### 7. Tools & Actions
- **MCP (Model Context Protocol)**
- Action Tools
- The Evolution: From Prompts to Actions
- The Orchestration Challenge

## Architecture Flow
```
User Input → Agent → 
  ├─ Query Augmentation
  ├─ Retrieval (RAG/Vector Search)
  ├─ Memory (Short-term/Long-term)
  ├─ Action Tools (MCP)
  └─ Prompt Engineering
→ Answer
```

## Key Insight
> "You can't fix this fundamental limitation by just writing better prompts. You have to build a system around the model."

---

**Relevance to Intention Alliance:**
This framework is critical for building systems that monetize user intentions while protecting attention. Context engineering enables:
- Understanding user intent from minimal input
- Maintaining conversation coherence across sessions
- Grounding responses in user preferences (attention optimization)
- Tool orchestration for intention capture and monetization
