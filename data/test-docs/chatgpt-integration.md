# ChatGPT Integration Guide

## Overview

This document describes how the company uses ChatGPT (OpenAI) across different teams and the guidelines for responsible usage.

## Approved Use Cases

### Engineering Team
- **Code review assistance** — Use ChatGPT to review code for potential bugs, security issues, and performance improvements.
- **Documentation generation** — Generate API documentation, README files, and code comments.
- **Debugging** — Describe errors and get suggestions for fixes.
- **Learning** — Understand unfamiliar libraries, frameworks, or programming concepts.

### Product Team
- **User research synthesis** — Summarize user interview transcripts and identify patterns.
- **PRD drafting** — Generate initial drafts of Product Requirements Documents.
- **Competitive analysis** — Research and compare competitor features.

### Marketing Team
- **Content drafting** — Generate initial drafts for blog posts, social media, and email campaigns.
- **Translation** — Quick translations for multi-language content (must be reviewed by native speakers).

## Security Guidelines

### DO NOT share with ChatGPT:
- Customer personal data (PII)
- API keys, passwords, or credentials
- Internal financial data or revenue numbers
- Proprietary algorithms or trade secrets
- Employee personal information

### Safe to share:
- Public documentation and open-source code
- Generic code patterns (without business logic)
- Publicly available information

## Company ChatGPT Account

The company provides a **ChatGPT Team** subscription. To get access:
1. Submit a request via IT Service Desk
2. Your manager must approve the request
3. Access is provisioned within 1 business day

Account URL: https://chat.openai.com (use company SSO to log in)

## API Access

For programmatic access, the Engineering team manages a shared OpenAI API key:
- Request access via the `#ai-platform` Slack channel
- API usage is tracked and billed to your team's budget
- Rate limit: 10,000 requests per day per team
- Approved models: GPT-4o, GPT-4o-mini

## Alternatives

The company also evaluates other LLM providers:
- **Claude (Anthropic)** — Used for coding tasks via Claude Code CLI
- **Qwen (Alibaba Cloud)** — Used for Chinese language tasks and as a cost-effective alternative
- **Gemini (Google)** — Under evaluation for multimodal use cases
