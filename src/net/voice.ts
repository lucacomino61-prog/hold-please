// Voice chat for a room: a WebRTC mesh between the players, signalled through the room's socket ('rtc' notes that
// the server relays to one player and never stores). Your microphone is sent only while the mic is on; you hear
// everyone who has theirs on. STUN only (no relay server), so two players behind the strictest networks may not
// connect; the game says so instead of pretending.
import { bus } from '../game/state';
import { room } from './room';
import { toast } from '../ui/toast';

const ICE: RTCConfiguration = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
interface Peer { pc: RTCPeerConnection; audio: HTMLAudioElement; polite: boolean; makingOffer: boolean }
const peers = new Map<string, Peer>();
const sig = { out: 0, in: 0, problems: [] as string[] };   // signalling counters for stats()
const sendRtc = (to: string, data: unknown): void => { sig.out++; room.send({ t: 'rtc', to, data }); };
const problem = (what: string, e: unknown): void => { const m = what + ': ' + String((e as Error)?.message ?? e).slice(0, 120); sig.problems.push(m); if (sig.problems.length > 12) sig.problems.shift(); console.warn('voice', m); };
let local: MediaStream | null = null;
let micOn = false;
let host: HTMLElement | null = null;

function me(): string { return room.state?.you ?? room.seat?.id ?? ''; }
function others(): string[] { return (room.state?.players ?? []).filter((p) => p.here && p.id !== me()).map((p) => p.id); }
function mount(): HTMLElement { if (!host) { host = document.createElement('div'); host.className = 'voice-audio'; host.setAttribute('aria-hidden', 'true'); document.body.appendChild(host); } return host; }

function peerFor(id: string): Peer {
  let p = peers.get(id);
  if (p) return p;
  const pc = new RTCPeerConnection(ICE);
  const audio = document.createElement('audio'); audio.autoplay = true; mount().appendChild(audio);
  // the lower id is the polite side of the perfect-negotiation dance
  p = { pc, audio, polite: me() < id, makingOffer: false };
  peers.set(id, p);
  if (local) for (const t of local.getAudioTracks()) pc.addTrack(t, local);
  else pc.addTransceiver('audio', { direction: 'recvonly' });
  pc.ontrack = (e) => { audio.srcObject = e.streams[0] ?? new MediaStream([e.track]); void audio.play().catch(() => { /* needs a gesture; the mic button was one */ }); };
  pc.onicecandidate = (e) => { if (e.candidate) sendRtc(id, { candidate: e.candidate.toJSON() }); };
  pc.onnegotiationneeded = async () => {
    try { p!.makingOffer = true; await pc.setLocalDescription(); sendRtc(id, { description: pc.localDescription }); }
    catch (e) { problem('offer', e); }
    finally { p!.makingOffer = false; }
  };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { toast('Voice: could not reach one player (their network blocks it).', 'info', 4000); } bus.emit('voice:state'); };
  return p;
}

async function onSignal({ from, data }: { from: string; data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } }): Promise<void> {
  if (!from || !data) return;
  sig.in++;
  const p = peerFor(from);
  const { pc } = p;
  try {
    if (data.description) {
      const offerCollision = data.description.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      if (offerCollision && !p.polite) return;
      await pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') { await pc.setLocalDescription(); sendRtc(from, { description: pc.localDescription }); }
    } else if (data.candidate) {
      try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!offerIgnored(p)) throw e; }
    }
  } catch (e) { problem('signal', e); }
}
const offerIgnored = (p: Peer) => !p.polite;

function drop(id: string): void {
  const p = peers.get(id); if (!p) return;
  p.pc.close(); p.audio.remove(); peers.delete(id); bus.emit('voice:state');
}

export const voice = {
  get on(): boolean { return micOn; },
  /** how many players you are connected to by voice */
  connected(): number { return [...peers.values()].filter((p) => p.pc.connectionState === 'connected').length; },
  supported(): boolean { return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia; },
  async toggle(): Promise<boolean> {
    if (micOn) { this.off(); return false; }
    if (!room.live) { toast('Voice needs a live room.', 'info'); return false; }
    try { local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); }
    catch { toast('No microphone, or permission refused.', 'danger'); return false; }
    micOn = true;
    // add the track to every peer (new ones get it in peerFor) and call everyone who is here
    for (const [id, p] of peers) { const sender = p.pc.getSenders().find((s) => s.track?.kind === 'audio'); const track = local.getAudioTracks()[0]; if (sender) void sender.replaceTrack(track); else p.pc.addTrack(track, local); void id; }
    for (const id of others()) peerFor(id);
    bus.emit('voice:state');
    toast('Mic on. Everyone in the room with voice on can hear you.', 'money', 3500);
    return true;
  },
  off(): void {
    micOn = false;
    local?.getTracks().forEach((t) => t.stop()); local = null;
    for (const p of peers.values()) { const sender = p.pc.getSenders().find((s) => s.track?.kind === 'audio'); if (sender) void sender.replaceTrack(null); }
    bus.emit('voice:state');
  },
  /** leaving the room: everything down */
  hangUpAll(): void { this.off(); for (const id of [...peers.keys()]) drop(id); },
  /** per player: the connection state and the audio bytes sent and received so far (Settings, the probes) */
  async stats(): Promise<{ id: string; state: string; signaling: string; ice: string; sent: number; received: number; sig: typeof sig }[]> {
    const out: { id: string; state: string; signaling: string; ice: string; sent: number; received: number; sig: typeof sig }[] = [];
    for (const [id, p] of peers) {
      let sent = 0, received = 0;
      try {
        (await p.pc.getStats()).forEach((r: { type?: string; kind?: string; bytesSent?: number; bytesReceived?: number }) => {
          if (r.type === 'outbound-rtp' && r.kind === 'audio') sent += r.bytesSent ?? 0;
          if (r.type === 'inbound-rtp' && r.kind === 'audio') received += r.bytesReceived ?? 0;
        });
      } catch { /* closed */ }
      out.push({ id, state: p.pc.connectionState, signaling: p.pc.signalingState, ice: p.pc.iceConnectionState, sent, received, sig });
    }
    return out;
  },
};

bus.on<{ from: string; data: unknown }>('room:rtc', (m) => { void onSignal(m as Parameters<typeof onSignal>[0]); });
bus.on('room:state', () => { const here = new Set(others()); for (const id of [...peers.keys()]) if (!here.has(id)) drop(id); });
bus.on('room:gone', () => voice.hangUpAll());
bus.on('room:left', () => voice.hangUpAll());
