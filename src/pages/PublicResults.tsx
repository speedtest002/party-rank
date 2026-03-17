import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import useSWR from 'swr';
import type { PartyRank, SongResult } from '../types';

interface ResultsData {
  partyRank: PartyRank;
  summary: { total_songs: number; total_participants: number; highest_avg: number; lowest_avg: number } | null;
  results: SongResult[];
  breakdown: Record<number, { discord_username: string; discord_avatar: string | null; rank: number; score: number }[]>;
}

const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error('Unable to load results');
    return res.json() as Promise<ResultsData>;
  });

const songTypeLabel = (t: 1 | 2 | 3) => (t === 1 ? 'OP' : t === 2 ? 'ED' : 'IN');

export default function PublicResults() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'summary' | 'breakdown'>('summary');

  const { data, error, isLoading } = useSWR(
    slug ? `/api/party-rank/${slug}/results` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 600000, // 10 minutes
    }
  );

  const allVoters = useMemo(() => {
    if (!data?.breakdown) return [];
    const set = new Set<string>();
    Object.values(data.breakdown).forEach(arr => {
      arr.forEach(v => set.add(v.discord_username || 'Participant'));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.breakdown]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 400, width: '100%', padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Results Unavailable</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{error.message}</p>
          <Link to="/party-rank" className="btn btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Back to Events
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--muted)', fontSize: 15 }}>Loading results...</div>
      </div>
    );
  }

  const { partyRank, summary, results, breakdown } = data;
  const maxAvg = Math.max(...results.map(r => r.avg_score ?? 0), 1);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)' }}>
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
              <span style={{ fontWeight: 700, fontSize: 18 }}>Ranking — {partyRank.name}</span>
              <span className={`badge badge-${partyRank.status}`} style={{ textTransform: 'capitalize' }}>
                {partyRank.status === 'revealed' ? 'Revealed' :
                 partyRank.status === 'open' ? 'Voting' :
                 partyRank.status === 'closed' ? 'Closed' : 'Draft'}
              </span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              {(partyRank.status === 'open' || partyRank.status === 'closed') && (
                <Link to={`/party-rank/${slug}/vote`} className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13, textDecoration: 'none' }}>
                  Join Event
                </Link>
              )}
              <SignedIn><UserButton /></SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>Login</button>
                </SignInButton>
              </SignedOut>
            </div>
          </div>
        </div>
      </header>

      <div className="container animate-fadeIn" style={{ paddingTop: 32, paddingBottom: 60, maxWidth: 1000 }}>
        {partyRank.status !== 'revealed' || !summary ? (
          <div className="panel" style={{ padding: 60, textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Results not yet revealed</h2>
            {partyRank.status === 'open' && (
              <Link to={`/party-rank/${slug}/vote`} className="btn btn-primary" style={{ padding: '12px 24px', fontSize: 15, textDecoration: 'none' }}>
                Vote now
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-card-value">{summary.total_participants}</div>
                <div className="stat-card-label">Participants</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{summary.total_songs}</div>
                <div className="stat-card-label">Songs</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{summary.highest_avg?.toFixed(2) ?? '—'}</div>
                <div className="stat-card-label">Highest Score</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-value">{summary.lowest_avg?.toFixed(2) ?? '—'}</div>
                <div className="stat-card-label">Lowest Score</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
              {['summary', 'breakdown'].map(t => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t as any)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '12px 4px',
                    fontSize: 15,
                    fontWeight: activeTab === t ? 700 : 500,
                    color: activeTab === t ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: -1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {t === 'summary' ? 'Overview' : 'Detailed Breakdown'}
                </button>
              ))}
            </div>

            <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                {activeTab === 'summary' ? (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>#</th>
                        <th>Song Details</th>
                        <th>Anime</th>
                        <th className="align-right">Avg Score</th>
                        <th className="align-right" style={{ width: 80 }}>Votes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((song, idx) => (
                        <tr key={song.ann_song_id}>
                          <td>
                            <span
                              className="rank-num"
                              style={{
                                fontSize: 16,
                                fontWeight: 700,
                                color: idx === 0 ? '#d97706'
                                  : idx === 1 ? '#6b7280'
                                  : idx === 2 ? '#92400e'
                                  : 'var(--muted)',
                              }}
                            >
                              #{song.final_rank}
                            </span>
                          </td>
                          <td>
                            {song.video_url || song.audio_url ? (
                              <a 
                                href={song.video_url || song.audio_url || '#'} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="song-title" 
                                style={{ fontWeight: 600 }}
                              >
                                {song.song_title}
                              </a>
                            ) : (
                              <div className="song-title" style={{ fontWeight: 600 }}>{song.song_title}</div>
                            )}
                            {song.artist && (
                              <div className="song-sub" style={{ opacity: 0.7 }}>
                                {song.artist}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 13 }}>
                            <div style={{ marginBottom: 4 }}>{song.anime}</div>
                            <span className="badge badge-secondary" style={{ fontSize: 10, padding: '2px 6px' }}>
                              {songTypeLabel(song.song_type)}
                            </span>
                          </td>
                          <td className="align-right">
                            <div className="score-bar-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
                              <div className="score-bar" style={{ width: 100, height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                                <div
                                  className="score-bar-fill"
                                  style={{ 
                                    width: `${((song.avg_score ?? 0) / maxAvg) * 100}%`,
                                    height: '100%',
                                    backgroundColor: 'var(--accent)',
                                    borderRadius: 3
                                  }}
                                />
                              </div>
                              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 40, textAlign: 'right' }}>
                                {song.avg_score?.toFixed(2) ?? '—'}
                              </span>
                            </div>
                          </td>
                          <td className="align-right" style={{ color: 'var(--muted)', fontSize: 13 }}>
                            {song.vote_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                    <table style={{ minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--surface)', width: 60, minWidth: 60, borderBottom: '1px solid var(--border)' }}>#</th>
                          <th style={{ position: 'sticky', left: 60, zIndex: 10, background: 'var(--surface)', width: 280, minWidth: 280, borderBottom: '1px solid var(--border)' }}>Song</th>
                          <th style={{ position: 'sticky', left: 340, zIndex: 10, background: 'var(--surface)', width: 180, minWidth: 180, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>Anime</th>
                          {allVoters.map(v => (
                            <th key={v} className="align-center" style={{ minWidth: 120, borderBottom: '1px solid var(--border)' }}>{v}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((song) => (
                          <tr key={song.ann_song_id}>
                            <td style={{ position: 'sticky', left: 0, zIndex: 5, background: 'var(--surface)', width: 60, minWidth: 60, borderBottom: '1px solid var(--border)' }}>
                              <span style={{ fontWeight: 700, color: 'var(--muted)' }}>#{song.final_rank}</span>
                            </td>
                            <td style={{ position: 'sticky', left: 60, zIndex: 5, background: 'var(--surface)', width: 280, minWidth: 280, borderBottom: '1px solid var(--border)' }}>
                              {song.video_url || song.audio_url ? (
                                <a 
                                  href={song.video_url || song.audio_url || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="song-title" 
                                  style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                >
                                  {song.song_title}
                                </a>
                              ) : (
                                <div className="song-title" style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{song.song_title}</div>
                              )}
                              {song.artist && <div className="song-sub" style={{ fontSize: 11, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</div>}
                            </td>
                            <td style={{ position: 'sticky', left: 340, zIndex: 5, background: 'var(--surface)', width: 180, minWidth: 180, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 12, whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{song.anime}</div>
                            </td>
                            {allVoters.map(v => {
                              const vote = breakdown[song.ann_song_id]?.find(b => (b.discord_username || 'Participant') === v);
                              return (
                                <td key={v} className="align-center" style={{ verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
                                  {vote ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                      <strong style={{ fontSize: 14, color: 'var(--text)' }}>{vote.score}</strong>
                                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>#{vote.rank}</span>
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--border)' }}>-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
