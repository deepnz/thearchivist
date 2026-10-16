// Speech prompt library: what to talk about (category, theme, difficulty) and
// how to deliver it. Pure data and selection logic — no DOM — unit tested.
//
// - Category: the kind of speech.
// - Theme: what it's about.
// - Difficulty: sets prep time and target length; Challenge adds a twist.
// - Delivery: the speaking style to practice. Each has a coaching cue, a pace
//   target and the report skills that show whether you hit it.

export const CATEGORIES = [
  { key: 'story', label: 'Storytelling', blurb: 'A beginning, a turn and an ending people remember.', deliveries: ['storyteller', 'warm', 'conversational'] },
  { key: 'persuade', label: 'Persuasion', blurb: 'Change what your listener thinks or does.', deliveries: ['persuasive', 'energetic', 'authoritative'] },
  { key: 'explain', label: 'Explain & teach', blurb: 'Make something clear to someone new to it.', deliveries: ['conversational', 'calm', 'crisp'] },
  { key: 'opinion', label: 'Opinion & debate', blurb: 'Take a side and back it up.', deliveries: ['persuasive', 'conversational', 'authoritative'] },
  { key: 'workplace', label: 'Workplace', blurb: 'Updates, pitches and hard conversations at work.', deliveries: ['crisp', 'authoritative', 'conversational'] },
  { key: 'occasion', label: 'Special occasions', blurb: 'Toasts, tributes, welcomes and thank-yous.', deliveries: ['warm', 'energetic', 'storyteller'] },
  { key: 'impromptu', label: 'Table topics', blurb: 'Quick thinking on an unexpected question.', deliveries: ['conversational', 'energetic', 'storyteller'] },
  { key: 'interview', label: 'Interview answers', blurb: 'Clear, specific answers to common questions.', deliveries: ['crisp', 'conversational', 'authoritative'] },
];

export const THEMES = [
  { key: 'life', label: 'Personal growth' },
  { key: 'work', label: 'Work & career' },
  { key: 'tech', label: 'Technology & the future' },
  { key: 'places', label: 'Travel & places' },
  { key: 'culture', label: 'Food, arts & culture' },
  { key: 'nature', label: 'Science & nature' },
  { key: 'society', label: 'Society & ethics' },
  { key: 'play', label: 'Fun & imagination' },
];

export const DIFFICULTIES = [
  { key: 'warmup', label: 'Warm-up', prepSec: 60, lengthSec: 60, note: 'A familiar subject. Plan for a minute, then speak for about a minute.' },
  { key: 'standard', label: 'Standard', prepSec: 30, lengthSec: 120, note: 'Thirty seconds to plan, about two minutes to speak.' },
  { key: 'challenge', label: 'Challenge', prepSec: 0, lengthSec: 180, note: 'No prep: start speaking right away, for about three minutes, and work in the twist.' },
];

// pace: words-per-minute target for this style. focus: report skills that
// show whether the delivery landed (keys from report.js).
export const DELIVERIES = [
  { key: 'conversational', label: 'Conversational', cue: "Talk as if you're explaining to a friend over coffee: relaxed, natural and varied.", pace: { min: 130, max: 165 }, focus: ['fillers', 'intonation'] },
  { key: 'calm', label: 'Calm & deliberate', cue: 'Slow down and leave a full pause after every key point.', pace: { min: 110, max: 140 }, focus: ['pace', 'pauses'] },
  { key: 'energetic', label: 'Energetic', cue: 'Lift your volume, keep a brisk pace and let your enthusiasm show.', pace: { min: 150, max: 180 }, focus: ['volume', 'pace'] },
  { key: 'storyteller', label: 'Expressive storyteller', cue: 'Paint pictures with your voice: vary your pitch, and slow down for the big moment.', pace: { min: 120, max: 160 }, focus: ['intonation', 'pauses'] },
  { key: 'persuasive', label: 'Persuasive', cue: 'Speak with conviction: stress the key words and end each claim on a firm, falling note.', pace: { min: 130, max: 165 }, focus: ['intonation', 'volume'] },
  { key: 'authoritative', label: 'Formal & authoritative', cue: 'Measured and confident: a steady pace, no filler words, statements that land.', pace: { min: 120, max: 150 }, focus: ['fillers', 'pace'] },
  { key: 'warm', label: 'Warm & sincere', cue: 'Gentle and heartfelt: unhurried, with pauses that let the words sink in.', pace: { min: 115, max: 145 }, focus: ['pauses', 'intonation'] },
  { key: 'crisp', label: 'Crisp & concise', cue: 'Get to the point: short sentences, no filler, and finish on time.', pace: { min: 140, max: 170 }, focus: ['fillers', 'pace'] },
];

// Extra constraints for Challenge prompts.
export const TWISTS = [
  'Start with a question to your audience.',
  'Use exactly three main points, and say so in your first sentence.',
  'Include one specific number or statistic.',
  'End by asking your audience to do one specific thing.',
  'Include a short quote, from a famous person or someone you know.',
  'Pause for two full seconds before your final sentence.',
  'Tell a personal story within the first 30 seconds.',
  'Describe one scene using at least three of the five senses.',
  'Keep every sentence under fifteen words.',
  'Make your closing line call back to your opening line.',
  'No filler words: replace every "um" with a silent pause.',
  "Don't say \"I\" for the first minute.",
];

const P = (category, difficulty, theme, text) => ({ category, difficulty, theme, text });

export const PROMPTS = [
  // ---- Storytelling ----
  P('story', 'warmup', 'culture', "Tell the story of the best meal you've ever had."),
  P('story', 'warmup', 'places', 'Describe the first time you traveled somewhere on your own.'),
  P('story', 'warmup', 'life', 'Tell us about a teacher or mentor who changed how you see something.'),
  P('story', 'warmup', 'work', 'Share the story of your first job and the most important thing it taught you.'),
  P('story', 'warmup', 'nature', 'Tell the story of a pet, plant or garden you once cared for.'),
  P('story', 'standard', 'life', 'Tell the story of a time a plan fell apart, and what you did next.'),
  P('story', 'standard', 'tech', 'Describe a moment when technology failed you at exactly the wrong time.'),
  P('story', 'standard', 'society', 'Tell the story of a stranger who helped you, and why you still remember it.'),
  P('story', 'standard', 'places', 'Recount a trip that went differently from how you planned, and what you found instead.'),
  P('story', 'standard', 'work', "Tell the story of a project that almost didn't happen."),
  P('story', 'challenge', 'life', "Tell a story about a decision you'd make differently today, without blaming anyone, yourself included."),
  P('story', 'challenge', 'play', 'Tell the story of an object in your home, with the object as the narrator.'),
  P('story', 'challenge', 'culture', 'Tell the story behind a family tradition, and what would be lost if it ended.'),
  P('story', 'challenge', 'nature', 'Tell the story of a scientific discovery with a hero, a setback and a turning point.'),
  P('story', 'challenge', 'places', 'Tell a story that changes how your audience sees an ordinary place, like a bus stop or a grocery store.'),

  // ---- Persuasion ----
  P('persuade', 'warmup', 'culture', 'Convince us to try your favorite food.'),
  P('persuade', 'warmup', 'nature', 'Persuade your audience to take a walk outside every day.'),
  P('persuade', 'warmup', 'play', 'Make the case for your favorite game, sport or hobby.'),
  P('persuade', 'warmup', 'work', 'Convince your coworkers to take a real lunch break.'),
  P('persuade', 'warmup', 'places', 'Pitch your hometown as the next great travel destination.'),
  P('persuade', 'standard', 'society', 'Argue that every school should teach personal finance.'),
  P('persuade', 'standard', 'tech', 'Persuade a skeptical friend to back up their phone and photos this week.'),
  P('persuade', 'standard', 'work', 'Convince your team to cancel one recurring meeting.'),
  P('persuade', 'standard', 'life', 'Make the case for learning a skill that has nothing to do with your career.'),
  P('persuade', 'standard', 'nature', 'Persuade your city council to plant trees on one specific street.'),
  P('persuade', 'challenge', 'society', 'Argue for a position you personally disagree with, as convincingly as you can.'),
  P('persuade', 'challenge', 'tech', 'Persuade a room of experts that their field is underrating something.'),
  P('persuade', 'challenge', 'life', "Convince people to give up something they enjoy for a month, and tell them what they'll gain."),
  P('persuade', 'challenge', 'work', 'Make the case to a room of nervous managers that failure should be celebrated.'),
  P('persuade', 'challenge', 'culture', 'Persuade your audience that a boring-sounding invention, like the shipping container, changed the world.'),

  // ---- Explain & teach ----
  P('explain', 'warmup', 'culture', 'Explain how to make your favorite simple dish.'),
  P('explain', 'warmup', 'play', 'Teach us a game you loved as a kid.'),
  P('explain', 'warmup', 'places', 'Explain how to get around your city without a car.'),
  P('explain', 'warmup', 'work', 'Explain what you actually do at work to a ten-year-old.'),
  P('explain', 'warmup', 'tech', 'Teach us one trick that makes your phone or computer easier to use.'),
  P('explain', 'standard', 'nature', 'Explain why the sky is blue, or another everyday science question, without jargon.'),
  P('explain', 'standard', 'life', 'Teach a beginner the first three things to know about a hobby you love.'),
  P('explain', 'standard', 'society', 'Explain how an important decision gets made in your town, school or workplace.'),
  P('explain', 'standard', 'tech', 'Explain how the internet gets a web page onto your screen.'),
  P('explain', 'standard', 'places', 'Walk us through planning a great trip on a tight budget.'),
  P('explain', 'standard', 'play', 'Teach us how to win at a card or board game you know well.'),
  P('explain', 'challenge', 'work', 'Explain a concept from your field using only an analogy from cooking.'),
  P('explain', 'challenge', 'life', 'Explain compound interest so clearly that your listener could explain it back.'),
  P('explain', 'challenge', 'nature', 'Explain how vaccines train the immune system, with no notes.'),
  P('explain', 'challenge', 'culture', "Explain a piece of art or music you love to someone who's sure they won't like it."),
  P('explain', 'challenge', 'tech', 'Explain how artificial intelligence learns from examples, to an audience of skeptical grandparents.'),

  // ---- Opinion & debate ----
  P('opinion', 'warmup', 'life', 'Is it better to be a morning person or a night owl?'),
  P('opinion', 'warmup', 'culture', 'Should pineapple go on pizza? Defend your answer.'),
  P('opinion', 'warmup', 'places', 'Beach or mountains: which makes the better vacation?'),
  P('opinion', 'warmup', 'play', 'Are video games a waste of time?'),
  P('opinion', 'warmup', 'work', 'Is working from home better than working in an office?'),
  P('opinion', 'standard', 'tech', 'Should social media have age limits, and who should enforce them?'),
  P('opinion', 'standard', 'work', 'Is it ever right to break a rule at work?'),
  P('opinion', 'standard', 'places', 'Should cities ban cars from their centers?'),
  P('opinion', 'standard', 'life', 'Is it better to be a specialist or a generalist?'),
  P('opinion', 'standard', 'nature', 'Should zoos exist?'),
  P('opinion', 'standard', 'play', 'Are superhero movies good for storytelling, or crowding everything else out?'),
  P('opinion', 'challenge', 'work', 'Argue for and against a four-day work week, then give your verdict.'),
  P('opinion', 'challenge', 'nature', 'Should we try to bring extinct species back?'),
  P('opinion', 'challenge', 'tech', 'Is giving up privacy a fair price for convenience?'),
  P('opinion', 'challenge', 'society', 'Should voting be mandatory?'),
  P('opinion', 'challenge', 'culture', 'Does tipping make service better or worse?'),

  // ---- Workplace ----
  P('workplace', 'warmup', 'work', 'Introduce yourself to a new team in under a minute.'),
  P('workplace', 'warmup', 'work', 'Give a quick update on something you finished this week.'),
  P('workplace', 'warmup', 'society', 'Thank a colleague in front of the team for help they gave you.'),
  P('workplace', 'warmup', 'places', "Propose one change to your workspace and explain why it's worth it."),
  P('workplace', 'warmup', 'tech', 'Give a 60-second pitch for a product you use every day.'),
  P('workplace', 'standard', 'work', 'Tell your team that a deadline has moved up by two weeks.'),
  P('workplace', 'standard', 'work', 'Pitch a new idea to your manager in two minutes and ask for one thing.'),
  P('workplace', 'standard', 'work', 'Kick off a project: the goal, the plan, and what you need from each person.'),
  P('workplace', 'standard', 'life', "Explain a mistake you made and what you're doing to fix it."),
  P('workplace', 'standard', 'nature', 'Pitch a sustainability change your workplace could make this year.'),
  P('workplace', 'standard', 'play', 'Pitch a team outing that everyone will actually enjoy.'),
  P('workplace', 'challenge', 'work', "Defend your project's budget to a skeptical finance team."),
  P('workplace', 'challenge', 'life', "Give a farewell speech for a colleague you didn't always get along with."),
  P('workplace', 'challenge', 'work', 'Answer a hostile question from the audience: "Why should we trust this plan?"'),
  P('workplace', 'challenge', 'work', 'Present results that are worse than expected, without sounding defensive.'),
  P('workplace', 'challenge', 'tech', "Introduce an AI tool to a team that's worried it will replace them."),

  // ---- Special occasions ----
  P('occasion', 'warmup', 'life', 'Give a short birthday toast to a friend.'),
  P('occasion', 'warmup', 'culture', "Welcome guests to a dinner party you're hosting."),
  P('occasion', 'warmup', 'work', 'Thank a team after a big event went well.'),
  P('occasion', 'warmup', 'society', 'Introduce a speaker you admire, real or imagined.'),
  P('occasion', 'warmup', 'places', "Raise a toast to the best place you've ever lived."),
  P('occasion', 'standard', 'life', "Give a toast at a friend's wedding, with one story and one wish."),
  P('occasion', 'standard', 'work', 'Present an award to someone who deserves more recognition.'),
  P('occasion', 'standard', 'life', 'Give a graduation speech to a class you were part of.'),
  P('occasion', 'standard', 'society', 'Open a community event that celebrates your neighborhood.'),
  P('occasion', 'standard', 'nature', 'Pay tribute to a pet that meant a lot to you or someone you know.'),
  P('occasion', 'challenge', 'places', 'Give a farewell tribute to a place that no longer exists, like an old shop or a demolished building.'),
  P('occasion', 'challenge', 'play', "Accept an award you didn't expect to win, with no notes."),
  P('occasion', 'challenge', 'work', 'Toast a retiring colleague whose work most people never saw.'),
  P('occasion', 'challenge', 'society', 'Welcome new citizens to your country.'),
  P('occasion', 'challenge', 'culture', 'Open an arts festival with a speech about why art matters in hard times.'),

  // ---- Table topics ----
  P('impromptu', 'warmup', 'life', 'If you could master any skill overnight, what would it be?'),
  P('impromptu', 'warmup', 'life', "What's the best piece of advice you ever ignored?"),
  P('impromptu', 'warmup', 'play', 'Describe your perfect ordinary Saturday.'),
  P('impromptu', 'warmup', 'culture', 'What smell takes you straight back to childhood?'),
  P('impromptu', 'warmup', 'places', 'If you could live in any city for a year, where would you go?'),
  P('impromptu', 'standard', 'nature', 'If animals could talk, which species would be the rudest?'),
  P('impromptu', 'standard', 'tech', 'What invention do you wish had never been made?'),
  P('impromptu', 'standard', 'life', 'What would you do with an extra hour every day?'),
  P('impromptu', 'standard', 'work', 'Describe your job as if it were a sport.'),
  P('impromptu', 'standard', 'culture', 'What tradition would you start if you could?'),
  P('impromptu', 'challenge', 'play', "You find a door in your home you've never noticed before. What's behind it?"),
  P('impromptu', 'challenge', 'play', "Explain the rules of a sport that doesn't exist yet."),
  P('impromptu', 'challenge', 'society', 'What will future historians misunderstand most about today?'),
  P('impromptu', 'challenge', 'work', 'You have to teach a class tomorrow on something you know nothing about. How do you start?'),
  P('impromptu', 'challenge', 'culture', 'Argue that one color matters more than all the others.'),

  // ---- Interview answers ----
  P('interview', 'warmup', 'work', 'Tell me about yourself.'),
  P('interview', 'warmup', 'life', 'What are you most proud of from the last year?'),
  P('interview', 'warmup', 'work', 'Why do you want this role? Pick any job you would love.'),
  P('interview', 'warmup', 'life', 'What do you do to recharge after a hard week?'),
  P('interview', 'warmup', 'tech', "What's one tool you couldn't do your work without?"),
  P('interview', 'standard', 'work', 'Tell me about a time you disagreed with a manager.'),
  P('interview', 'standard', 'life', 'Describe a time you had to learn something quickly.'),
  P('interview', 'standard', 'society', 'Tell me about a conflict on a team and how it was resolved.'),
  P('interview', 'standard', 'life', "What's your biggest weakness, and what are you doing about it?"),
  P('interview', 'standard', 'tech', "Tell me about a time you used data to change someone's mind."),
  P('interview', 'standard', 'play', 'Tell me about a hobby, and what it says about how you work.'),
  P('interview', 'challenge', 'life', "Tell me about your biggest failure and what you'd do differently now."),
  P('interview', 'challenge', 'work', 'Why should we hire you over someone with more experience?'),
  P('interview', 'challenge', 'work', "Explain a company you admire to a customer who's never heard of it."),
  P('interview', 'challenge', 'tech', 'Where will your industry be in ten years, and where do you fit?'),
  P('interview', 'challenge', 'work', 'Tell me about a decision you made with incomplete information.'),
];

const byKey = (list) => Object.fromEntries(list.map((item) => [item.key, item]));
export const CATEGORY = byKey(CATEGORIES);
export const THEME = byKey(THEMES);
export const DIFFICULTY = byKey(DIFFICULTIES);
export const DELIVERY = byKey(DELIVERIES);

const ANY = 'any';
const pickOne = (list, rand) => list[Math.floor(rand() * list.length)];

/**
 * Picks a prompt matching the filters ({ category, theme, difficulty, delivery },
 * each a key or "any"). If nothing matches every filter, the theme is relaxed
 * first, then the difficulty, and `relaxed` names what was loosened.
 * `avoid` is the current prompt's text, so "Another prompt" always changes it.
 * @returns {{ prompt, category, theme, difficulty, delivery, twist: string|null, relaxed: string[] }}
 */
export function pickPrompt(filters = {}, { avoid = null, rand = Math.random } = {}) {
  const want = { category: ANY, theme: ANY, difficulty: ANY, delivery: ANY, ...filters };
  const matches = (p, keys) => keys.every((k) => want[k] === ANY || p[k] === want[k]);

  const attempts = [
    { keys: ['category', 'theme', 'difficulty'], relaxed: [] },
    { keys: ['category', 'difficulty'], relaxed: ['theme'] },
    { keys: ['category', 'theme'], relaxed: ['difficulty'] },
    { keys: ['category'], relaxed: ['theme', 'difficulty'] },
  ];
  let pool = [];
  let relaxed = [];
  for (const attempt of attempts) {
    pool = PROMPTS.filter((p) => matches(p, attempt.keys));
    if (pool.length) { relaxed = attempt.relaxed; break; }
  }
  const choices = pool.length;
  if (pool.length > 1 && avoid) pool = pool.filter((p) => p.text !== avoid);

  const prompt = pickOne(pool, rand);
  const deliveryKey = want.delivery !== ANY ? want.delivery : pickOne(CATEGORY[prompt.category].deliveries, rand);
  const difficulty = DIFFICULTY[prompt.difficulty];
  return {
    prompt: prompt.text,
    category: CATEGORY[prompt.category],
    theme: THEME[prompt.theme],
    difficulty,
    delivery: DELIVERY[deliveryKey],
    twist: difficulty.key === 'challenge' ? pickOne(TWISTS, rand) : null,
    relaxed,
    choices,
  };
}

// What a session stores about its prompt (keys and text, not whole objects).
export function promptRecord(pick) {
  return {
    text: pick.prompt,
    category: pick.category.key,
    theme: pick.theme.key,
    difficulty: pick.difficulty.key,
    delivery: pick.delivery.key,
    twist: pick.twist,
  };
}
