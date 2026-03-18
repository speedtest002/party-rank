import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useSWR from 'swr';
import { useSession, signIn, signOut } from '../lib/auth-client';
import type { PartyRank, Participant, SongResult, Song } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MasterData {
  partyRank: PartyRank;
  progress: { total: number; submitted: number; viewed: number; invited: number };
  participants: Participant[];
  results: SongResult[];
  breakdown: Record<number, { discord_username: string; discord_id: string; rank: number; score: number }[]>;
}

type TabId = 'progress' | 'results' | 'songs' | 'settings';

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error || 'Fetch failed');
  return data as MasterData;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const songTypeLabel = (t: 1 | 2 | 3) => (t === 1 ? 'OP' : t === 2 ? 'ED' : 'IN');

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
};

const exportCsv = (results: SongResult[], prName: string) => {
  const header = ['Rank', 'Song', 'Artist', 'Anime', 'Type', 'Avg Score', 'Avg Rank', 'Votes'];
  const rows = results.map(r => [
    r.final_rank,
    `"${r.song_title}"`,
    `"${r.artist ?? ''}"`,
    `"${r.anime}"`,
    songTypeLabel(r.song_type),
    r.avg_score?.toFixed(2) ?? '',
    r.avg_rank?.toFixed(2) ?? '',
    r.vote_count,
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${prName}-results.csv`; a.click();
  URL.revokeObjectURL(url);
};

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Mini status dot */
const StatusDot = ({ status }: { status: string }) => (
  <span className={`status-dot ${status}`} title={status} />
);

/** Sidebar shared across tabs */
const Sidebar = ({
  progress,
  participants,
}: {
  progress: MasterData['progress'];
  participants: Participant[];
}) => {
  const [participantSearch, setParticipantSearch] = useState('');
  const pct = progress.total > 0 ? (progress.submitted / progress.total) * 100 : 0;
  const filtered = participants.filter(p =>
    (p.discord_username ?? p.discord_id).toLowerCase().includes(participantSearch.toLowerCase())
  );

  return (
    <aside className="sidebar animate-fadeIn">
      {/* Progress panel */}
      <div className="panel">
        <div className="panel-header">Progress</div>
        <div className="panel-body">
          <div className="progress-row">
            <span className="progress-label">{progress.submitted}/{progress.total}</span>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--green)' }}>Submitted</span>
              <span style={{ fontWeight: 600 }}>{progress.submitted}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--amber)' }}>Viewing</span>
              <span style={{ fontWeight: 600 }}>{progress.viewed}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>Not Viewed</span>
              <span style={{ fontWeight: 600 }}>{progress.invited}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Participant list panel */}
      <div className="panel">
        <div className="panel-header">Participants</div>
        <div className="panel-body" style={{ paddingBottom: 8 }}>
          <input
            className="participant-search"
            placeholder="Search..."
            value={participantSearch}
            onChange={e => setParticipantSearch(e.target.value)}
          />
          <div className="participant-list">
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: '12px 0' }}>No results found</div>
            ) : filtered.map(p => (
              <div key={p.id} className="participant-row">
                <span className="participant-name">{p.discord_username ?? p.discord_id}</span>
                <StatusDot status={p.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

// ─── TAB: Progress ─────────────────────────────────────────────────────────────

const ProgressTab = ({
  data,
  slug,
  mutate,
}: {
  data: MasterData;
  slug: string;
  mutate: () => void;
}) => {
  const { progress, participants } = data;
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filtered = participants.filter(p =>
    (p.discord_username ?? p.discord_id).toLowerCase().includes(search.toLowerCase())
  );

  const postAction = async (body: object) => {
    const res = await fetch(`/api/party-rank/${slug}/master`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = (await res.json()) as any;
    if (!res.ok) throw new Error(d.error || 'Server error');
    return d;
  };

  const handleRemove = async (p: Participant) => {
    if (!confirm(`Remove "${p.discord_username ?? p.discord_id}" from session?`)) return;
    setLoading(p.id);
    try {
      await postAction({ action: 'remove', participant_id: p.id });
      setMsg({ type: 'success', text: 'Participant removed.' });
      mutate();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally { setLoading(null); }
  };

  const handleCopyLink = (p: Participant) => {
    const url = `${window.location.origin}/party-rank/${slug}/vote`;
    navigator.clipboard.writeText(url);
    setMsg({ type: 'success', text: 'Link copied!' });
    setTimeout(() => setMsg(null), 2000);
  };

  return (
    <div className="animate-fadeIn">
      {/* Stat cards */}
      <div className="stat-cards">
        <StatCard value={progress.total}     label="Total Participants"   />
        <StatCard value={progress.submitted} label="Submitted"    color="var(--green)" />
        <StatCard value={progress.viewed + progress.invited} label="Pending" color="var(--amber)" />
        <StatCard value={data.results.length} label="Total Songs"   />
      </div>

      {/* Table */}
      <div className="panel">
        {msg && <div className={`alert alert-${msg.type}`} style={{ margin: '12px 16px 0', borderRadius: 6 }}>{msg.text}</div>}

        <div className="toolbar">
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="search-input"
              placeholder="Search participants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-spacer" />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} people</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Status</th>
                <th>Viewed At</th>
                <th>Submitted At</th>
                <th>Submits</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">No participants yet.</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{p.discord_username ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{p.discord_id}</div>
                  </td>
                  <td>
                    <span className={`p-badge ${p.status}`}>
                      <StatusDot status={p.status} />
                      {p.status === 'submitted' ? 'Submitted' : p.status === 'viewed' ? 'Viewing' : 'Not Viewed'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(p.first_viewed_at)}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtDate(p.submitted_at)}</td>
                  <td className="align-center" style={{ fontSize: 13 }}>{p.submit_count}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Copy personal link"
                        onClick={() => handleCopyLink(p)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="13" height="13" x="9" y="9" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        title="Remove participant"
                        disabled={loading === p.id}
                        onClick={() => handleRemove(p)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── TAB: Results ─────────────────────────────────────────────────────────────

const ResultsTab = ({
  data,
  slug,
  mutate,
}: {
  data: MasterData;
  slug: string;
  mutate: () => void;
}) => {
  const { results, partyRank, progress } = data;
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const maxAvg = useMemo(() => Math.max(...results.map(r => r.avg_score ?? 0), 1), [results]);

  const filtered = results.filter(r =>
    r.song_title.toLowerCase().includes(search.toLowerCase()) ||
    (r.anime ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (r.artist ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = async (action: string) => {
    const labels: Record<string, string> = {
      open: 'Open voting session',
      close: 'Close voting session',
      reveal: 'Reveal results',
    };
    if (!confirm(`Confirm: ${labels[action]}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/party-rank/${slug}/master`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      setMsg({ type: 'success', text: 'Success!' });
      mutate();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="animate-fadeIn">
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="search-input"
              placeholder="Search songs, anime..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-spacer" />

          {/* Action buttons based on status */}
          {partyRank.status === 'draft' && (
            <button className="btn btn-success" disabled={loading} onClick={() => handleAction('open')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 3l14 9-14 9V3z"/></svg>
              Open Session
            </button>
          )}
          {partyRank.status === 'open' && (
            <button className="btn btn-danger" disabled={loading} onClick={() => handleAction('close')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect width="6" height="16" x="4" y="4" rx="1"/><rect width="6" height="16" x="14" y="4" rx="1"/></svg>
              Close Session
            </button>
          )}
          {partyRank.status === 'closed' && (
            <button className="btn btn-primary" disabled={loading} onClick={() => handleAction('reveal')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              Reveal Results
            </button>
          )}

          <button
            className="btn"
            onClick={() => exportCsv(results, partyRank.name)}
            title="Export CSV"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
            Export CSV
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Song</th>
                <th>Anime</th>
                <th className="align-right">Avg Score</th>
                <th className="align-right">Avg Rank</th>
                <th className="align-right">Votes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">
                  {results.length === 0 ? 'No results available yet.' : 'No matches found.'}
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.ann_song_id}>
                  <td><span className="rank-num">#{r.final_rank}</span></td>
                  <td>
                    {r.video_url || r.audio_url ? (
                      <a 
                        href={`https://eudist.animemusicquiz.com/${r.video_url || r.audio_url || ''}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="song-title"
                      >
                        {r.song_title}
                      </a>
                    ) : (
                      <div className="song-title">{r.song_title}</div>
                    )}
                    <div className="song-sub">{r.artist}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {r.anime}
                    <span className="song-type-tag" style={{ marginLeft: 6 }}>{songTypeLabel(r.song_type)}</span>
                  </td>
                  <td className="align-right">
                    <div className="score-bar-wrap">
                      <div className="score-bar">
                        <div className="score-bar-fill" style={{ width: `${((r.avg_score ?? 0) / maxAvg) * 100}%` }} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 13, minWidth: 36 }}>{r.avg_score?.toFixed(2) ?? '—'}</span>
                    </div>
                  </td>
                  <td className="align-right" style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {r.avg_rank?.toFixed(1) ?? '—'}
                  </td>
                  <td className="align-right" style={{ fontSize: 13 }}>
                    {r.vote_count}<span style={{ color: 'var(--muted)', fontSize: 11 }}>/{progress.submitted}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── TAB: Songs ─────────────────────────────────────────────────────────────

const SongsTab = ({
  data,
  slug,
  mutate,
}: {
  data: MasterData;
  slug: string;
  mutate: () => void;
}) => {
  const { results: songs, partyRank } = data;
  const [bulkInput, setBulkInput]   = useState('');
  const [adding, setAdding]         = useState(false);
  const [removing, setRemoving]     = useState<number | null>(null);
  const [search, setSearch]         = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const filtered = songs.filter(s =>
    s.song_title.toLowerCase().includes(search.toLowerCase()) ||
    (s.anime ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const isLocked = partyRank.status === 'closed' || partyRank.status === 'revealed';

  const postAction = async (body: object) => {
    const res = await fetch(`/api/party-rank/${slug}/master`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = (await res.json()) as any;
    if (!res.ok) throw new Error(d.error || 'Server error');
    return d;
  };

  const handleAddSongs = async () => {
    const ids = bulkInput
      .split(/[\s,;]+/)
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n));

    if (!ids.length) {
      setMsg({ type: 'error', text: 'Please enter at least one valid ann_song_id.' });
      return;
    }

    setAdding(true);
    setMsg(null);
    try {
      const d = await postAction({ action: 'add_song', ann_song_ids: ids });
      setMsg({ type: 'success', text: `Successfully added ${d.added} songs.` });
      setBulkInput('');
      mutate();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally { setAdding(false); }
  };

  const handleRemoveSong = async (annSongId: number, title: string) => {
    if (!confirm(`Delete song "${title}"?`)) return;
    setRemoving(annSongId);
    try {
      await postAction({ action: 'remove_song', ann_song_ids: [annSongId] });
      setMsg({ type: 'success', text: 'Song deleted.' });
      mutate();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally { setRemoving(null); }
  };

  return (
    <div className="animate-fadeIn">
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Add form */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">Add Songs from AniSongDB</div>
        <div className="panel-body">
          <div className="form-group">
            <label className="form-label">ann_song_id (multiple IDs, comma separated)</label>
            <textarea
              className="input"
              placeholder="e.g. 1001, 1002, 5437"
              value={bulkInput}
              onChange={e => setBulkInput(e.target.value)}
              disabled={isLocked}
            />
            <div className="form-hint">Enter IDs from anisongdb.com, separated by commas or newlines.</div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleAddSongs}
            disabled={adding || isLocked || !bulkInput.trim()}
          >
            {adding ? 'Adding...' : 'Add Songs'}
          </button>
          {isLocked && (
            <div className="alert alert-warn" style={{ marginTop: 12, marginBottom: 0 }}>
              Session is locked — cannot add/remove songs.
            </div>
          )}
        </div>
      </div>

      {/* Songs table */}
      <div className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="search-input"
              placeholder="Search songs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="toolbar-spacer" />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{songs.length} songs</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 64 }}>#</th>
                <th>Song</th>
                <th>Anime</th>
                <th style={{ width: 48 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">
                  {songs.length === 0 ? 'No songs yet. Add from AniSongDB above.' : 'No matches found.'}
                </td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.ann_song_id}>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{s.ann_song_id}</td>
                  <td>
                    {s.video_url || s.audio_url ? (
                      <a 
                        href={`https://eudist.animemusicquiz.com/${s.video_url || s.audio_url || ''}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="song-title"
                      >
                        {s.song_title}
                      </a>
                    ) : (
                      <div className="song-title">{s.song_title}</div>
                    )}
                    <div className="song-sub">{s.artist}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {s.anime}
                    <span className="song-type-tag" style={{ marginLeft: 6 }}>{songTypeLabel(s.song_type)}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Remove song"
                      disabled={removing === s.ann_song_id || isLocked}
                      onClick={() => handleRemoveSong(s.ann_song_id, s.song_title)}
                      style={{ color: 'var(--red)' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── TAB: Settings ─────────────────────────────────────────────────────────────

const SettingsTab = ({
  data,
  slug,
  mutate,
}: {
  data: MasterData;
  slug: string;
  mutate: () => void;
}) => {
  const { partyRank } = data;
  const [form, setForm] = useState({
    name:          partyRank.name,
    description:   partyRank.description ?? '',
    spotify_url:   partyRank.spotify_url ?? '',
    youtube_url:   partyRank.youtube_url ?? '',
    starts_at:     partyRank.starts_at ? partyRank.starts_at.slice(0, 16) : '',
    deadline:      partyRank.deadline   ? partyRank.deadline.slice(0, 16)  : '',
    score_min:     String(partyRank.score_min),
    score_max:     String(partyRank.score_max),
    allow_resubmit: partyRank.allow_resubmit,
    discord_guild_id: partyRank.discord_guild_id ?? '',
    discord_thread_id: partyRank.discord_thread_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const payload: Record<string, unknown> = {
      name:          form.name,
      description:   form.description || null,
      spotify_url:   form.spotify_url || null,
      youtube_url:   form.youtube_url || null,
      starts_at:     form.starts_at || null,
      deadline:      form.deadline || null,
      score_min:     parseFloat(form.score_min),
      score_max:     parseFloat(form.score_max),
      allow_resubmit: form.allow_resubmit,
      discord_guild_id: form.discord_guild_id || null,
      discord_thread_id: form.discord_thread_id || null,
    };
    try {
      const res = await fetch(`/api/party-rank/${slug}/master`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', data: payload }),
      });
      const d = (await res.json()) as any;
      if (!res.ok) throw new Error(d.error);
      setMsg({ type: 'success', text: 'Changes saved.' });
      mutate();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally { setSaving(false); }
  };

  return (
    <div className="animate-fadeIn">
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      <div className="panel">
        <div className="panel-header">General Settings</div>
        <div className="panel-body">
          <div className="form-group">
            <label className="form-label">Event Name</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="input" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Spotify URL</label>
              <input className="input" placeholder="https://open.spotify.com/..." value={form.spotify_url} onChange={e => set('spotify_url', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">YouTube URL</label>
              <input className="input" placeholder="https://youtube.com/..." value={form.youtube_url} onChange={e => set('youtube_url', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Discord Guild ID</label>
              <input className="input" placeholder="Server ID" value={form.discord_guild_id} onChange={e => set('discord_guild_id', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Discord Thread ID</label>
              <input className="input" placeholder="Thread/Channel ID" value={form.discord_thread_id} onChange={e => set('discord_thread_id', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Starts At</label>
              <input className="input" type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Deadline</label>
              <input className="input" type="datetime-local" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Min Score</label>
              <input className="input" type="number" value={form.score_min} onChange={e => set('score_min', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Max Score</label>
              <input className="input" type="number" value={form.score_max} onChange={e => set('score_max', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.allow_resubmit}
                onChange={e => set('allow_resubmit', e.target.checked)}
                style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Allow re-submission</span>
            </label>
          </div>

          <div className="divider" />
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Stat Card (helper) ────────────────────────────────────────────────────────

const StatCard = ({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) => (
  <div className="stat-card">
    <div className="stat-card-value" style={color ? { color } : {}}>
      {value}
    </div>
    <div className="stat-card-label">{label}</div>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MasterDashboard() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>('progress');

  const { data, error, isLoading, mutate } = useSWR(
    !isPending && session && slug ? `/api/party-rank/${slug}/master` : null,
    fetcher,
    { 
      refreshInterval: 60000, 
      revalidateOnFocus: false, 
      revalidateOnReconnect: false,
      dedupingInterval: 30000,
      shouldRetryOnError: false 
    }
  );

  // ── Auth guards ──────────────────────────────────────────────────────────────
  if (isPending) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>Loading...</div>;
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 400, width: '100%', padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Master Login</h1>
          <button 
            onClick={() => signIn.social({ provider: 'discord' })} 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '12px' }}
          >
            Login with Discord
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 400, width: '100%', padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Error</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{error.message}</p>
          <Link to="/party-rank" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Back to Events
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--muted)' }}>Loading dashboard...</div>
      </div>
    );
  }

  const { partyRank } = data;

  const TABS: { id: TabId; label: string }[] = [
    { id: 'progress', label: 'Progress' },
    { id: 'results',  label: 'Results' },
    { id: 'songs',    label: 'Songs' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <>
      <header className="top-header">
        <div className="top-header-inner">
          <div className="top-header-row1" style={{ height: 60, display: 'flex', alignItems: 'center', padding: '0 24px' }}>
            <button 
              onClick={() => navigate('/party-rank')}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: 13, marginRight: 16 }}
            >
              ← All Events
            </button>
            <div className="top-header-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>{partyRank.name}</span>
              <span className={`badge badge-${partyRank.status}`} style={{ textTransform: 'capitalize' }}>
                {partyRank.status === 'draft'    ? 'Draft'
                 : partyRank.status === 'open'   ? 'Open'
                 : partyRank.status === 'closed' ? 'Closed'
                 : 'Revealed'}
              </span>
            </div>
            <div className="top-header-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => mutate()} title="Refresh">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              </button>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {session.user.image && (
                  <img src={session.user.image} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                )}
                <span style={{ fontSize: 14 }}>{session.user.name}</span>
                <button 
                  onClick={() => signOut()} 
                  className="btn" 
                  style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)' }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          {/* Tab nav */}
          <nav className="tab-nav">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="container animate-fadeIn" style={{ paddingTop: 24, paddingBottom: 60 }}>
        <div className="main-grid">
          {/* Sidebar */}
          <Sidebar progress={data.progress} participants={data.participants} />

          {/* Content area */}
          <div className="dashboard-content">
            {activeTab === 'progress' && <ProgressTab data={data} slug={slug!} mutate={mutate} />}
            {activeTab === 'results'  && <ResultsTab  data={data} slug={slug!} mutate={mutate} />}
            {activeTab === 'songs'    && <SongsTab    data={data} slug={slug!} mutate={mutate} />}
            {activeTab === 'settings' && <SettingsTab data={data} slug={slug!} mutate={mutate} />}
          </div>
        </div>
      </div>
    </>
  );
}
