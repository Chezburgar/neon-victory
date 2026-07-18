// net.js — multiplayer over Supabase Realtime channels (broadcast + presence, no DB)
const SB_URL = 'https://bgoxonxxutkporbqbtbh.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnb3hvbnh4dXRrcG9yYnFidGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NjQzNDYsImV4cCI6MjA5OTQ0MDM0Nn0.o0obh7NwBn50TOxhdUl7mdccWOzuqJs_TpiG609wlbM';
const rnd4 = () => String(Math.floor(1000 + Math.random() * 9000));

export const net = {
  online: false, isHost: false, myTeam: 'blue', mySlot: 0, roomCode: null,
  status: 'idle', // idle | queue | room
  queueSize: 0, roster: [], remotes: new Map(),
  myId: Math.random().toString(36).slice(2, 10),
  cb: {}, _c: null, _q: null, _r: null, _started: false, _auto: false,
  _pcs: new Map(), _mic: null, micLevel: 0,

  client() {
    if (!this._c) this._c = window.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 25 } } });
    return this._c;
  },
  teamOf(id) { return (this.roster.find(m => m.id === id) || {}).team || 'orange'; },

  quickMatch() {
    if (this.status !== 'idle' || !window.supabase) return;
    this.status = 'queue'; this.queueSize = 1;
    const ch = this._q = this.client().channel('nv-queue', { config: { presence: { key: this.myId } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      const list = Object.keys(st).map(k => ({ id: k, t: (st[k][0] || {}).t || 0 }))
        .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      this.queueSize = list.length;
      if (list.length >= 2 && list[0].id === this.myId) {
        const ids = list.slice(0, 6).map(x => x.id);
        const code = rnd4();
        ch.send({ type: 'broadcast', event: 'assign', payload: { ids, code } });
        this._leaveQueue();
        this._joinRoom(code, true);
      }
    });
    ch.on('broadcast', { event: 'assign' }, ({ payload }) => {
      if (payload.ids.includes(this.myId)) { this._leaveQueue(); this._joinRoom(payload.code, true); }
    });
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ t: Date.now() }); });
  },
  createPrivate() { if (this.status === 'idle' && window.supabase) this._joinRoom(rnd4(), false); },
  joinPrivate(code) { if (this.status === 'idle' && window.supabase) this._joinRoom(String(code), false); },
  cancel() { this._leaveQueue(); },
  _leaveQueue() {
    if (this._q) { this.client().removeChannel(this._q); this._q = null; }
    if (this.status === 'queue') this.status = 'idle';
    this.queueSize = 0;
  },

  _joinRoom(code, autoStart) {
    this.roomCode = code; this.status = 'room'; this.online = true;
    this._auto = autoStart; this._joinT = Date.now(); this._started = false;
    const ch = this._r = this.client().channel('nv-room-' + code, {
      config: { broadcast: { self: false }, presence: { key: this.myId } }
    });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      this.roster = Object.keys(st).map(k => ({ id: k, t: (st[k][0] || {}).t || 0 }))
        .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      this.roster.forEach((m, i) => { m.team = i % 2 === 0 ? 'blue' : 'orange'; m.slot = Math.floor(i / 2) % 3; });
      const me = this.roster.find(m => m.id === this.myId);
      if (me) { this.myTeam = me.team; this.mySlot = me.slot; }
      this.isHost = this.roster.length > 0 && this.roster[0].id === this.myId;
      for (const id of [...this.remotes.keys()]) {
        if (!this.roster.find(m => m.id === id)) { if (this.cb.onLeave) this.cb.onLeave(id); this.remotes.delete(id); this._dropPeer(id); }
      }
      this._startVoice();
      if (this.cb.onRoom) this.cb.onRoom();
      if (this._auto && this.isHost && this.roster.length >= 2 && !this._started) {
        setTimeout(() => this.startMatchNet(), 2500);
      }
    });
    const on = (ev, fn) => ch.on('broadcast', { event: ev }, ({ payload }) => fn(payload));
    on('start', p => { this._started = true; if (this.cb.onStart) this.cb.onStart(p); });
    on('pose', p => {
      let r = this.remotes.get(p.i);
      if (!r) { r = { id: p.i }; this.remotes.set(p.i, r); }
      r.p = p.p; r.q = p.q; r.l = p.l; r.rh = p.r; r.d = p.d; r.lastT = performance.now();
    });
    on('disc', p => { if (this.cb.onDisc) this.cb.onDisc(p); });
    on('grab', p => { if (this.cb.onGrab) this.cb.onGrab(p); });
    on('throw', p => { if (this.cb.onThrow) this.cb.onThrow(p); });
    on('goal', p => { if (this.cb.onGoal) this.cb.onGoal(p); });
    on('reset', p => { if (this.cb.onReset) this.cb.onReset(p); });
    on('end', p => { if (this.cb.onEnd) this.cb.onEnd(p); });
    on('tick', p => { if (this.cb.onTick) this.cb.onTick(p); });
    on('stun', p => { if (p.v === this.myId && this.cb.onStunned) this.cb.onStunned(); });
    on('here', p => { if (this.cb.onHere) this.cb.onHere(p); });
    on('rtc', p => this._onRtc(p));
    ch.subscribe(s => { if (s === 'SUBSCRIBED') ch.track({ t: this._joinT }); });
  },

  // ---- voice chat (WebRTC full mesh, signaled over the room channel)
  async initMic() {
    if (this._mic !== undefined && this._mic !== null) return this._mic;
    try {
      this._mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(this._mic);
      const an = ac.createAnalyser(); an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const poll = () => {
        an.getByteTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; s += d * d; }
        this.micLevel = Math.sqrt(s / buf.length);
        setTimeout(poll, 90);
      };
      poll();
    } catch { this._mic = false; }
    return this._mic;
  },
  async _startVoice() {
    const mic = await this.initMic();
    if (!mic || !this._r) return;
    for (const m of this.roster) {
      if (m.id !== this.myId && !this._pcs.has(m.id) && this.myId < m.id) this._makePC(m.id, true);
    }
  },
  _makePC(peer, initiator) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    this._pcs.set(peer, pc);
    if (this._mic) for (const tr of this._mic.getTracks()) pc.addTrack(tr, this._mic);
    pc.onicecandidate = e => { if (e.candidate) this.send('rtc', { to: peer, from: this.myId, k: 'ice', d: JSON.stringify(e.candidate) }); };
    pc.ontrack = e => {
      let el = document.getElementById('vc-' + peer);
      if (!el) { el = document.createElement('audio'); el.id = 'vc-' + peer; el.autoplay = true; document.body.appendChild(el); }
      el.srcObject = e.streams[0];
    };
    if (initiator) {
      pc.createOffer().then(o => pc.setLocalDescription(o))
        .then(() => this.send('rtc', { to: peer, from: this.myId, k: 'offer', d: JSON.stringify(pc.localDescription) }))
        .catch(() => {});
    }
    return pc;
  },
  async _onRtc(p) {
    if (p.to !== this.myId) return;
    try {
      let pc = this._pcs.get(p.from);
      if (p.k === 'offer') {
        await this.initMic();
        if (!pc) pc = this._makePC(p.from, false);
        await pc.setRemoteDescription(JSON.parse(p.d));
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        this.send('rtc', { to: p.from, from: this.myId, k: 'answer', d: JSON.stringify(pc.localDescription) });
      } else if (p.k === 'answer' && pc) await pc.setRemoteDescription(JSON.parse(p.d));
      else if (p.k === 'ice' && pc) await pc.addIceCandidate(JSON.parse(p.d));
    } catch {}
  },
  _dropPeer(id) {
    const pc = this._pcs.get(id);
    if (pc) { try { pc.close(); } catch {} this._pcs.delete(id); }
    const el = document.getElementById('vc-' + id);
    if (el) el.remove();
  },
  _stopVoice() { for (const id of [...this._pcs.keys()]) this._dropPeer(id); },

  startMatchNet() {
    if (!this._r || this._started) return;
    this._started = true;
    this.send('start', {});
    if (this.cb.onStart) this.cb.onStart({});
  },
  send(event, payload) { if (this._r) this._r.send({ type: 'broadcast', event, payload }); },
  leave() {
    this._leaveQueue();
    this._stopVoice();
    if (this._r) { this.client().removeChannel(this._r); this._r = null; }
    this.online = false; this.isHost = false; this.status = 'idle';
    this.roomCode = null; this.roster = []; this.remotes.clear();
    this.myTeam = 'blue'; this.mySlot = 0; this._started = false; this._auto = false;
  }
};
