# Notion Integration - Wobblus

## Configuration

**API Key:** Stored in `$HOME/.config/notion/api_key`  
**Integration Name:** Wobblus  
**Connection Status:** ✅ Connected

## Database Schema: Projects (Wobblus)

### Properties

| Property         | Type         | Options                                      | Description                               |
| ---------------- | ------------ | -------------------------------------------- | ----------------------------------------- |
| **Name**         | Title        | -                                            | Project name                              |
| **Category**     | Select       | Bitcash, Alygn, Personal                     | Top-level grouping                        |
| **Sub-area**     | Select       | Core, Infrastructure, Professional, Personal | Sub-categorization                        |
| **Status**       | Status       | Active, Planning, On Hold, Completed         | Current state                             |
| **Description**  | Rich Text    | -                                            | Project details and notes                 |
| **Tags**         | Multi-select | -                                            | Custom tags (flexible)                    |
| **Last Updated** | Date         | -                                            | Last modification date                    |
| **Owner**        | Person       | -                                            | Assigned to (default: contact@andler.dev) |

### Categories Structure

**1. Bitcash**

- Sub-areas: Core, Infrastructure
- Projects: Backend, Frontend, Infrastructure

**2. Alygn**

- Sub-areas: Core, Infrastructure
- Projects: Platform development, Community tools

**3. Personal**

- Sub-areas: Professional, Personal
- Projects: Skills development, Personal organization

---

## Current Projects to Sync

### Bitcash

- **Core:**
  - Backend development
  - Frontend development
- **Infrastructure:**
  - DevOps setup
  - Monitoring & logging

### Alygn

- **Core:**
  - Platform architecture
  - Community features
- **Infrastructure:**
  - Hosting & deployment
  - Security & compliance

### Personal

- **Professional:**
  - Skills & certifications
  - Network building
- **Personal:**
  - Health & fitness
  - Hobbies & creativity

---

_Created: 2026-01-30 13:34_  
_Integration: Wobblus (contact@andler.dev)_
