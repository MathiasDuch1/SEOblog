import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

/**
 * The single Anthropic client for the app. Reads `ANTHROPIC_API_KEY` from the environment.
 * The SDK retries 408/409/429/5xx and connection errors twice by default.
 */
export const anthropic = new Anthropic()

/** Model used for article generation and keyword clustering. */
export function generationModel(): string {
  return process.env.GENERATION_MODEL || 'claude-sonnet-5'
}

/** Effort level for generation requests. */
export function generationEffort(): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  const value = process.env.GENERATION_EFFORT
  return value === 'low' || value === 'high' || value === 'xhigh' || value === 'max' ? value : 'medium'
}
