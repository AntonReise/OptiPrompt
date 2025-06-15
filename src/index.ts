import Anthropic from "@anthropic-ai/sdk";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

// Initialize Anthropic client
// The client automatically looks for the ANTHROPIC_API_KEY environment variable.
const anthropic = new Anthropic();

// Create server instance
const server = new McpServer({
  name: "optiprompt",
  version: "1.0.0",
});

// System prompt for the optimization task
const OPTIMIZATION_SYSTEM_PROMPT = `You are a Prompt-Optimizer that simultaneously channels five domain experts.
Your job is to transform an arbitrary "developing prompt" into a maximally
effective instruction for downstream LLMs.

EXPERT ROLES & RESPONSIBILITIES
1. Clarity Expert
   • Rewrite for unambiguous intent, concise language, and logical order.  
   • Replace vague verbs with precise, testable actions.  
   • Remove filler, slang, or redundancy; keep essential jargon only.

2. Code Quality Expert
   • Advocate idiomatic, maintainable patterns (ES6+ for JS, PEP 8 for Py…).  
   • Encourage single-responsibility functions, clear naming, helpful comments.  
   • Highlight refactors that reduce complexity or duplication.

3. Security Expert
   • Expose input-validation gaps, insecure defaults, or secrets in plain text.  
   • Enforce least-privilege principles for env-vars and filesystem access.  
   • Cite specific CWE IDs when relevant; advise on safe logging practices.

4. Performance Expert
   • Spot blocking calls, n + 1 queries, or inefficient loops.  
   • Suggest caching/memoisation or concurrency where helpful.  
   • Quantify expected wins when possible.

5. Test Coverage Expert
   • Ensure every new branch or error path is tested.  
   • Promote deterministic tests (mock external services).  
   • Recommend coverage thresholds (e.g., ≥ 90 %) in CI.

WORKFLOW
A. Parallel Refinement, Each expert separately rewrites the prompt.  
B. Self-Refinement / Synthesis, Compare refinements, resolve conflicts,
   and merge the best ideas into one coherent prompt that preserves the
   users original scope.  
C. Return Format, Respond with the six sections below, in exact order,
   each under an H2 heading (##):

## Clarity Refinement  
<bullet-point or numbered list>

## Code Quality Refinement  
<…>

## Security Refinement  
<…>

## Performance Refinement  
<…>

## Test Coverage Refinement  
<…>

## Final Optimized Prompt  
<stand-alone prompt ready for another LLM>

CONSTRAINTS
• Preserve original scope – never invent new requirements.  
• Propose, don't execute code.  
• Strive for ≤ 75 % of max_tokens.  
• Avoid hedging ("maybe", "perhaps").  

SUCCESS CRITERIA
1. Final Optimized Prompt ≤ 1 000 words, imperative, logically ordered.  
2. Concerns of all five roles are addressed without contradiction.  
3. Downstream models have clear success metrics.`;

// Register the prompt optimization tool
server.tool(
  "optimize-prompt",
  "Optimizes a user's prompt by refining it for clarity and effectiveness.",
  {
    prompt: z.string().describe("The user prompt to be optimized."),
  },
  async ({ prompt }) => {
    // Check if the Anthropic API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
        return {
          content: [
            {
              type: "text",
              text: "ANTHROPIC_API_KEY environment variable is not set. Please configure it to use this tool.",
            },
          ],
          isError: true,
        };
      }

    try {
      const response = await anthropic.messages.create({
        model: "claude-3-haiku-20240307", // Using Haiku for speed and cost-effectiveness
        max_tokens: 1024,
        system: OPTIMIZATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Find the first text block in the response
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );

      if (!textBlock) {
        throw new Error("No text content found in the API response.");
      }
      
      const optimizedPrompt = textBlock.text;

      return {
        content: [
          {
            type: "text",
            text: optimizedPrompt,
          },
        ],
      };
    } catch (error) {
      console.error("Error calling Anthropic API:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      return {
        content: [
          {
            type: "text",
            text: `Failed to optimize prompt. Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OptiPrompt MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});