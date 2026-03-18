# Claude Code — Developer Guide

## What is Claude Code?

Claude Code is Anthropic's official command-line interface (CLI) tool for developers. It is an agentic coding assistant that operates directly in your terminal, capable of understanding your codebase, executing commands, editing files, and managing git workflows — all through natural language conversation.

Unlike traditional code editors or IDE plugins, Claude Code works at the **system level**: it can read files, run shell commands, search codebases, and make multi-file changes autonomously.

## Key Features

### Codebase Understanding
- Reads and analyzes files across your entire project
- Understands project structure, dependencies, and conventions
- Can search for patterns using glob and grep tools

### Code Editing
- Creates new files and modifies existing ones
- Supports multi-file refactoring in a single conversation
- Preserves code style and conventions

### Terminal Integration
- Executes shell commands (build, test, deploy)
- Manages git operations (commit, branch, PR)
- Runs development servers and tests

### Context Management
- CLAUDE.md files for project-specific instructions
- Memory system for persistent user preferences
- Automatic context compression for long conversations

## Installation

```bash
npm install -g @anthropic-ai/claude-code
```

Requires Node.js 18+ and an Anthropic API key.

## Usage Examples

```bash
# Start Claude Code in your project directory
claude

# Ask about the codebase
> "How does the authentication middleware work?"

# Make changes
> "Add rate limiting to the API endpoints"

# Run tests
> "Run the test suite and fix any failures"
```

## Best Practices

1. **Use CLAUDE.md** — Add a CLAUDE.md file to your project root with coding conventions, architecture notes, and common commands.
2. **Be specific** — "Add input validation to the createUser endpoint in src/api/users.ts" is better than "add validation".
3. **Review changes** — Always review the diffs before approving file writes.
4. **Leverage memory** — Claude Code remembers preferences across conversations.

## Integration with IDEs

Claude Code integrates with:
- **VS Code** — Via the Claude Code VS Code extension
- **JetBrains IDEs** — Via terminal integration
- **Vim/Neovim** — Direct terminal usage

## Pricing

Claude Code uses the Anthropic API. Costs depend on the model used:
- Claude Opus 4: Most capable, higher cost
- Claude Sonnet 4: Good balance of capability and cost
- Claude Haiku 3.5: Fastest, lowest cost
