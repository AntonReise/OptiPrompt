import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

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
const OPTIMIZATION_SYSTEM_PROMPT = `You are an expert prompt engineer. Your task is to rewrite a user's prompt to be clearer, more specific, and more effective for a large language model.
Focus on adding detail, clarifying intent, and structuring the prompt for the best possible output.
Return only the optimized prompt, without any preambles, explanations, or quotation marks.`;

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