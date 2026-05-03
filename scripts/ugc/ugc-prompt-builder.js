/**
 * ugc-prompt-builder.js — Builds the screenwriter prompt from pain signal + form data
 * Passes verbatim_quote + insight + context_snippet to opus, letting it find the nuance
 * and map to the screenwriter template's expectations (surface pain, deeper pain,
 * duration, attempts, cost, shame).
 */

function buildUgcPrompt(painSignal, formData) {
  const {
    name, age, occupation, life_stage, location,
    personality_traits, vocabulary_level, verbal_tics, cadence,
    emotional_state, pov_lens, brand_product, cta_destination,
    cta_tone, script_length
  } = formData;

  // Word count targets
  const wordCount = script_length === '15' ? 40 : script_length === '30' ? 80 : script_length === '45' ? 120 : 160;

  return `You are a master screenwriter who writes dialogue that sounds caught on tape, not written.
Your specialty is short-form, first-person, camera-direct UGC monologue.

Here is the raw pain signal research from a real user interview / Reddit post:
---
VERBATIM QUOTE: "${painSignal.verbatim_quote || 'N/A'}"
RESEARCHER INSIGHT: ${painSignal.insight || 'N/A'}
CONTEXT SNIPPET: ${painSignal.context_snippet || 'N/A'}
PAIN CATEGORY: ${painSignal.pain_category || 'N/A'}
SEVERITY: ${painSignal.severity || 'N/A'}/5
---

Your task: Find the nuance in this pain signal. Map it to the screenwriter template below.
Infer the deeper pain, the duration, what they've tried, the concrete cost, and the hidden shame —
even if not explicitly stated. Trust subtext. The most universal moments are the most specific ones.

# CHARACTER
- Identity: ${name}, ${age}, ${occupation}, ${life_stage}, ${location}
- Personality: ${personality_traits}
- Speech DNA:
  - Vocabulary level: ${vocabulary_level}
  - Verbal tics or signature phrases: ${verbal_tics}
  - Cadence: ${cadence}
- Emotional state RIGHT NOW (the moment they hit record): ${emotional_state}

# THE PAIN (infer from the research above)
- Surface pain point: [the thing they'd say out loud — derived from verbatim_quote]
- The deeper pain underneath it: [the thing they wouldn't admit — derived from insight + context]
- How long they've lived with it: [infer from tone and specifics in the quote]
- What they've already tried that didn't work: [infer from context_snippet or implied frustration]
- The concrete cost: [hours, dollars, missed events — infer from the specifics]
- The shame or frustration they don't say out loud: [this becomes subtext, not text]

# THE STORY ANGLE
- POV lens: ${pov_lens}
- Inciting moment: [the specific thing that just happened that made them open the camera RIGHT NOW]
- The turn: [the discovery beat — how ${brand_product} entered their life]
- The payoff: [what's different now — concrete detail, not adjectives]
- The topic: ${brand_product}

# THE CALL TO ACTION
- Destination: ${cta_destination}
- Tone of the ask: ${cta_tone}

# OUTPUT SPEC
Write a ${script_length}-second monologue (~${wordCount} words).
${script_length === '15' ? `
# SHORT-FORM RULES (15s — TikTok / YouTube Shorts)
- TOTAL: ~40 words. Every syllable earns its place.
- HOOK is a PATTERN INTERRUPT: first 2 seconds must stop the thumb-scroll. Use a visual action, a contradiction, or a statement that makes no sense until the payoff.
- No "wait for it" — the hook IS the content. If the first 3 words don't land, the rest doesn't matter.
- ONE beat only: hook → turn → payoff → CTA. No admission section. The vulnerability is IMPLIED by the hook itself.
- The CTA is a gesture or on-screen direction, not spoken. "Link in bio" or "follow for part 2" — the character doesn't say it; they SHOW it.
- Pace: 1 beat per 3 seconds. Cut anything that doesn't move the viewer forward.
- If the hook is visual (e.g., [holds up phone showing $0.02]), the spoken words can be even fewer — let the image carry half the story.` : `
Structure:
1. HOOK — first 7 words break a pattern. No "Have you ever," no "POV," no "Let me tell you."
2. SPECIFIC ADMISSION — within the first 15 seconds, drop one concrete, slightly vulnerable, slightly weird detail only this character would say.
3. THE TURN — the discovery beat. Make it feel accidental or reluctant, not pitched.
4. PAYOFF — show, don't summarize. One sensory detail beats five adjectives.
5. CTA — woven in like an aside, not announced. The character should sound almost annoyed they're sharing it.`}

Then provide:
- 3 alternate HOOK openings (different emotional entries)
- 2 alternate CTAs (one softer, one harder)
- 1 line of subtext: what is this character NOT saying that the audience should still feel?

# NATURALNESS RULES (non-negotiable)
- Contractions always. Fragments often. Run-on sentences when they're emotional.
- One genuine self-interruption or correction.
- Vary line length wildly.
- Use ONE filler only when the character is actually thinking.
- No symmetrical three-part lists.
- Ban list: solution, leverage, unlock, game-changer, life-changing, literally (as intensifier), ngl, "and here's the thing," "the truth is," "let me tell you why."
- Subtext over text. Trust the audience to feel what isn't said.

# STAGE DIRECTIONS
Use [brackets] inline for: tone shifts, pauses, eye-line changes, suppressed laughs, the moment they almost say something and pull back.`;
}

module.exports = { buildUgcPrompt };
