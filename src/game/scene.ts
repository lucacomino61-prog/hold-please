// What a caller can hear on your end. Events (events.ts) set the scene for a while; both brains may remark on it
// once per call, in character. Nothing here reaches past the one line: the game's rules do not change.
import { state } from './state';
import type { Caller } from './brain/types';
import { stylize } from './brain/style';

export type SceneKind = '' | 'siren' | 'fire' | 'boom' | 'boss' | 'popups' | 'dark' | 'wave' | 'ufo' | 'music' | 'poop' | 'fireworks' | 'lightning' | 'pandemic' | 'nuke' | 'wind' | 'geiger';

export const SCENE_TEXT: Record<Exclude<SceneKind, ''>, string> = {
  nuke: 'a nuclear siren and a countdown, everyone diving under their desks',
  wind: 'a hurricane tearing through an office, windows banging, papers everywhere',
  geiger: 'a Geiger counter clicking faster and faster and someone shouting "off the floor"',
  poop: 'a gurgle, a splash, and a whole office screaming about the toilets',
  fireworks: 'fireworks going off indoors, whistles and bangs, someone cheering',
  lightning: 'a lightning strike on the building: a crack, a hum, every computer rebooting',
  pandemic: 'everyone in the office coughing at once and someone shouting "masks"',
  siren: 'a police siren and someone shouting "hide everything"',
  fire: 'a fire alarm and people shouting about flames',
  boom: 'a whistle, then an explosion, then a lot of coughing',
  boss: 'a boss stomping past and yelling "close the fun"',
  popups: 'a computer beeping and pinging without stopping',
  dark: 'a power cut: everything just went quiet and dark',
  wave: 'rushing water, a wave crashing through an office, someone shouting "sandbags"',
  ufo: 'a humming beam of light and a colleague being lifted out of their chair',
  music: 'soft lo-fi music from a radio somewhere in the office',
};

const LINES: Record<Exclude<SceneKind, ''>, string[]> = {
  nuke: ['Is that a countdown? Why is there a countdown?', 'Someone said nuclear. I am going to hold the phone further away.', 'Are you under a desk? You sound under a desk.'],
  wind: ['Is that wind? Indoors?', 'Something just banged. Twice. Is your office flying?', 'I can hear papers. So many papers.'],
  geiger: ['What is that clicking? It is getting faster.', 'Is that a Geiger counter? Should I be worried for you? I am a little.', 'Someone shouted off the floor. Which floor? Are you on it?'],
  poop: ['What is that smell? I can smell it through the phone.', 'Did someone say toilets? Why is everyone screaming about toilets?', 'Is your office... flooding? With what, exactly?'],
  fireworks: ['Are those fireworks? Indoors? Who are you people?', 'Something is whistling and banging over there. A party?', 'Fireworks at a call centre. I have questions.'],
  lightning: ['Was that thunder? It sounded like it was inside the building.', 'Hello? Hello? Your line went funny for a second.', 'Did lightning just hit you? You sound hit.'],
  pandemic: ['Why is everyone coughing? Are you all sick?', 'That is a lot of coughing. Should you be at work?', 'Someone shouted "masks". I am backing away from the phone.'],
  siren: ['Is that a siren? Are you being arrested?', 'I can hear sirens. Should I hang up? I feel like I should hang up.', 'Why is someone shouting "hide everything" behind you?'],
  fire: ['Is something burning over there?', 'Why is someone shouting about flames? Is this a bad time?', 'I can hear an alarm. Is it the fun kind of alarm?'],
  boom: ['What was THAT? Are you alright?', 'Something just went bang on your end. I felt it from here.', 'Did your building just explode? Slightly?'],
  boss: ['Who is that shouting? Your boss? He sounds lovely.', 'Someone is yelling about fun. Is fun banned where you work?', 'Is that your manager? He has the voice of a man who counts strikes.'],
  popups: ['Your computer is making a lot of noises.', 'What is all that beeping? It sounds unwell.', 'Something on your end keeps pinging. Should it?'],
  dark: ['Hello? It went very quiet over there.', 'Did your lights just go? Mine do that too.', 'Everything went dark on your end, I can tell. I am good at dark.'],
  wave: ['Is that... water? Is your office underwater?', 'Someone just shouted "sandbags". Why would an office need sandbags?', 'I can hear waves. Are you selling from a beach?'],
  ufo: ['What is that humming? It sounds like a beam.', 'Did somebody just get lifted out of a chair? I heard a chair.', 'That hum. I know that hum. Tell them to put the person back.'],
  music: ['Is that music? Where are you, a lift?', 'Nice tune on your end. Turn it up, I am on hold half my life.', 'Lo-fi. In a call centre. Bold.'],
};

let timer: ReturnType<typeof setTimeout> | undefined;

export function setScene(kind: SceneKind, ms = 15_000): void {
  state.scene = kind;
  clearTimeout(timer);
  if (kind) timer = setTimeout(() => { if (state.scene === kind) state.scene = ''; }, ms);
}

export function sceneLine(c: Caller): string | null {
  const k = state.scene as Exclude<SceneKind, ''>;
  if (!k || !LINES[k]) return null;
  return stylize(c, LINES[k][Math.floor(Math.random() * LINES[k].length)], 0.5);
}
