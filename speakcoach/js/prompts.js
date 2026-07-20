// Impromptu speaking prompts ("table topics").

export const PROMPTS = [
  'Describe a piece of advice you ignored — and what happened.',
  'Convince us that breakfast is (or is not) the most important meal of the day.',
  'What technology from science fiction do you most want to exist?',
  'Tell the story of a small decision that changed your life.',
  'If you had to teach a class on anything non-work-related, what would it be?',
  'What is something everyone seems to love that you just don\'t get?',
  'Pitch your hometown as the next big travel destination.',
  'What skill should every adult learn, and why?',
  'Describe your perfect ordinary day — no lottery wins allowed.',
  'What would you tell your 15-year-old self, in two minutes?',
  'Argue for or against: remote work is better for creativity.',
  'What is the best purchase under $50 you have ever made?',
  'If animals could talk, which species would be the rudest?',
  'What tradition — family, cultural, or personal — matters most to you?',
  'Explain a hobby you love to someone who has never heard of it.',
  'What problem do you hope is solved in the next ten years?',
  'Describe a failure that taught you more than any success.',
  'If you could have dinner with anyone from history, who and why?',
  'What does "success" mean to you, beyond money and titles?',
  'Tell us about a place you have never been but feel drawn to.',
];

export function randomPrompt(excluding) {
  const pool = PROMPTS.filter((p) => p !== excluding);
  return pool[Math.floor(Math.random() * pool.length)];
}
