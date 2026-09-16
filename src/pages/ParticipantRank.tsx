import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useSWR from 'swr';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Song, Participant } from '../types';

const songTypeLabel = (t: number) => (t === 1 ? 'OP' : t === 2 ? 'ED' : 'IN');

interface AppData {
  pr: { 
    name: string; slug: string; status: string; 
    score_min: number; score_max: number; 
    allow_resubmit: boolean;
    discord_guild_id?: string;
    discord_thread_id?: string;
  };
  participant: Participant;
  songs: Song[];
  previousScores: Record<number, { rank: number; score: number }>;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const data = (await res.json()) as any;
  if (!res.ok) {
    const error = new Error(data.error || 'Fetch failed') as any;
    error.code = data.code;
    error.discord_guild_id = data.discord_guild_id;
    error.discord_thread_id = data.discord_thread_id;
    throw error;
  }
  return data as AppData;
};

// ─── Sortable Item ─────────────────────────────────────────────────────────────

const SortableItem = ({
  song,
  score,
  onScoreChange,
  min,
  max,
  rank,
}: {
  song: Song;
  score: string;
  onScoreChange: (id: number, score: string) => void;
  min: number;
  max: number;
  rank: number;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.ann_song_id.toString() });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging
      ? '0 8px 24px rgba(0,0,0,0.12)'
      : 'var(--shadow-sm)',
  };

  const scoreNum = parseFloat(score);
  const isInvalid =
    score !== '' && (isNaN(scoreNum) || scoreNum < min || scoreNum > max);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        marginBottom: 8,
        background: 'var(--surface)',
        border: `1px solid ${isInvalid ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      {/* Rank */}
      <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: rank <= 3 ? 'var(--accent)' : 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {rank}
        </span>
      </div>

      {/* Drag handle */}
      <div style={{ color: 'var(--border)', flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>
        </svg>
      </div>

      {/* Song info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          {song.video_url || song.audio_url ? (
            <a 
              href={`https://eudist.animemusicquiz.com/${song.video_url || song.audio_url || ''}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="song-title" 
              style={{ fontSize: 14, fontWeight: 600 }}
            >
              {song.song_title}
            </a>
          ) : (
            <div className="song-title" style={{ fontSize: 14, fontWeight: 600 }}>{song.song_title}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {song.artist && (
            <>
              <div className="song-sub" style={{ fontSize: 12, opacity: 0.8 }}>{song.artist}</div>
              <span style={{ color: 'var(--border)', fontSize: 12 }}>•</span>
            </>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {song.anime}
            <span className="song-type-tag" style={{ fontSize: 9 }}>{songTypeLabel(song.song_type)}</span>
          </div>
        </div>
      </div>

      {/* Score input */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        onPointerDown={e => e.stopPropagation()}
      >
        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {min}–{max}
        </span>
        <input
          type="number"
          step="0.5"
          min={min}
          max={max}
          className="input"
          style={{
            width: 76,
            textAlign: 'center',
            borderColor: isInvalid ? 'var(--red)' : undefined,
          }}
          value={score}
          onChange={e => onScoreChange(song.ann_song_id, e.target.value)}
        />
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ParticipantRank() {
  const { slug } = useParams<{ slug: string }>();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const isPending = !isLoaded;
  const session = isSignedIn ? { user: { name: user.fullName || 'User', image: user.imageUrl } } : null;

  const { data, error, isLoading, mutate } = useSWR(
    !isPending && session && slug ? `/api/party-rank/${slug}/vote` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 2000, // 2 seconds (was 10 minutes)
      shouldRetryOnError: false,
    }
  );

  const [items, setItems]       = useState<Song[]>([]);
  const [scores, setScores]     = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      let initialSongs = [...data.songs];
      const initialScores: Record<number, string> = {};

      if (Object.keys(data.previousScores).length > 0) {
        initialSongs.sort((a, b) => {
          const rankA = data.previousScores[a.ann_song_id]?.rank ?? 999;
          const rankB = data.previousScores[b.ann_song_id]?.rank ?? 999;
          return rankA - rankB;
        });
        for (const [id, s] of Object.entries(data.previousScores)) {
          initialScores[parseInt(id)] = s.score.toString();
        }
      }

      setItems(initialSongs);
      setScores(initialScores);
    }
  }, [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems(items => {
        const oldIndex = items.findIndex(i => i.ann_song_id.toString() === active.id);
        const newIndex = items.findIndex(i => i.ann_song_id.toString() === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleScoreChange = (id: number, val: string) =>
    setScores(prev => ({ ...prev, [id]: val }));

  const handleSubmit = async () => {
    if (!data) return;
    setMsg(null);

    const payload = items.map((song, idx) => ({
      ann_song_id: song.ann_song_id,
      rank: idx + 1,
      score: parseFloat(scores[song.ann_song_id] ?? ''),
    }));

    const invalid = payload.find(
      p => isNaN(p.score) || p.score < data.pr.score_min || p.score > data.pr.score_max
    );
    if (invalid) {
      setMsg({
        type: 'error',
        text: `Please enter a valid score between ${data.pr.score_min} and ${data.pr.score_max} for all songs.`,
      });
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch(`/api/party-rank/${slug}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ scores: payload }),
      });
      const resData = (await res.json()) as any;
      if (!res.ok) throw new Error(resData.error);
      setMsg({ type: 'success', text: 'Scores submitted successfully!' });
      mutate();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (isPending) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)' }}>Loading...</div>;
  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 400, width: '100%', padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Login to Vote</h1>
          <button 
            onClick={() => clerk.openSignIn({ strategy: 'oauth_discord' })} 
            className="btn btn-discord" 
            style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
          >
            <svg width="20" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}>
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.125-.094.249-.192.37-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.419-2.157 2.419z"/>
            </svg>
            Login with Discord
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    const isNotInvited = error.code === 'NOT_INVITED';
    const discordLink = error.discord_guild_id && error.discord_thread_id 
      ? `https://discord.com/channels/${error.discord_guild_id}/${error.discord_thread_id}`
      : null;

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg)', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 500, width: '100%', padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Access Denied</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>{error.message}</p>
          
          {isNotInvited && (
            <div style={{ padding: '16px 20px', backgroundColor: 'var(--accent-light)', color: 'var(--text)', borderRadius: 8, marginBottom: 24, fontSize: 14 }}>
              <p style={{ margin: 0 }}>Please join the Discord thread to participate in this event.</p>
              {discordLink && (
                <a 
                  href={discordLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ display: 'inline-block', marginTop: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Go to Discord Thread →
                </a>
              )}
            </div>
          )}

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
        <div style={{ color: 'var(--muted)' }}>Loading voting form...</div>
      </div>
    );
  }

  const { pr, participant } = data;
  const isReadOnly = participant.status === 'submitted' && !pr.allow_resubmit;
  const isClosed   = pr.status !== 'open';

  return (
    <>
      <div className="container animate-fadeIn" style={{ paddingTop: 32 }}>
        <div style={{ marginBottom: 40, paddingTop: 20 }}>
          {/* Status Bar */}
          <div className="panel" style={{ padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{pr.name}</span>
                <span className={`badge badge-${pr.status}`} style={{ textTransform: 'capitalize' }}>
                  {pr.status === 'open' ? 'Open' : pr.status === 'closed' ? 'Closed' : pr.status}
                </span>
             </div>
             <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Vote as <strong style={{ color: 'var(--text)' }}>{participant.discord_username ?? 'Participant'}</strong>
             </div>
          </div>

          {/* Status alerts */}
          {isReadOnly && (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              Scores submitted successfully. Re-submission is not allowed for this event.
            </div>
          )}
          {isClosed && (
            <div className="alert alert-warn" style={{ marginBottom: 16 }}>Voting is currently closed.</div>
          )}
          {msg && (
            <div className={`alert alert-${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>
          )}

          {/* Instruction */}
          <div style={{ marginBottom: 24, fontSize: 13, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              Drag and drop to rank (Rank 1 at the top)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Rate from {pr.score_min} to {pr.score_max}
            </div>
          </div>

          {/* Drag list */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(i => i.ann_song_id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div
                style={{
                  marginBottom: 32,
                  opacity: isReadOnly || isClosed ? 0.55 : 1,
                  pointerEvents: isReadOnly || isClosed ? 'none' : 'auto',
                }}
              >
                {items.map((song, idx) => (
                  <SortableItem
                    key={song.ann_song_id}
                    song={song}
                    rank={idx + 1}
                    score={scores[song.ann_song_id] ?? ''}
                    onScoreChange={handleScoreChange}
                    min={pr.score_min}
                    max={pr.score_max}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Submit */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: 15, justifyContent: 'center', height: 'auto' }}
            onClick={handleSubmit}
            disabled={submitting || isReadOnly || isClosed}
          >
            {submitting
              ? 'Submitting...'
              : isReadOnly
              ? 'Submitted'
              : isClosed
              ? 'Voting Closed'
              : 'Submit Ranking'}
          </button>
        </div>
      </div>
    </>
  );
}
