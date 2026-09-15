import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import useSWR from 'swr';

interface PRSummary {
  slug: string;
  name: string;
  description: string;
  cover_url: string;
  status: string;
  starts_at: string;
  deadline: string;
  closed_at: string;
  max_participants: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json() as Promise<{ partyRanks: PRSummary[] }>;
};

type FilterType = 'ALL' | 'ACTIVE' | 'DONE';

export default function PartyRankList() {
  const { data, error, isLoading } = useSWR('/api/party-rank', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    dedupingInterval: 600000, // 10 minutes
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [currentFilter, setCurrentFilter] = useState<FilterType>('ALL');

  const filteredRanks = useMemo(() => {
    if (!data || !data.partyRanks) return [];
    let list = [...data.partyRanks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(pr => 
        pr.name.toLowerCase().includes(q) || 
        (pr.description && pr.description.toLowerCase().includes(q))
      );
    }

    if (currentFilter === 'ACTIVE') {
      list = list.filter(pr => pr.status === 'open');
    } else if (currentFilter === 'DONE') {
      list = list.filter(pr => pr.status === 'closed' || pr.status === 'revealed');
    }

    return list;
  }, [data, searchQuery, currentFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="badge badge-open">Open</span>;
      case 'closed':
        return <span className="badge badge-closed">Closed</span>;
      case 'revealed':
        return <span className="badge badge-revealed">Revealed</span>;
      default:
        return <span className="badge badge-draft">Draft</span>;
    }
  };

  return (
    <>
      <main className="container animate-fadeIn" style={{ paddingTop: 40 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.04em', margin: '0 0 8px 0' }}>
            Party Rank List
          </h1>
        </div>

        {/* Toolbar */}
        <div className="panel" style={{ 
          padding: '16px 20px', 
          marginBottom: 24, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: 16,
          minHeight: '72px' 
        }}>
          {/* Search */}
          <div style={{ flex: 1, position: 'relative', maxWidth: '400px' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}></span>
            <input 
              type="text"
              placeholder="Search events..."
              className="search-input"
              style={{ paddingLeft: 36 }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', backgroundColor: '#f3f4f6', padding: 4, borderRadius: 8, gap: 4, flexShrink: 0 }}>
            {(['ALL', 'ACTIVE', 'DONE'] as FilterType[]).map(f => {
              const isActive = currentFilter === f;
              return (
                <button 
                  key={f}
                  onClick={() => setCurrentFilter(f)}
                  style={{
                    backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? 'var(--text)' : 'var(--muted)',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 0.1s ease',
                  }}
                >
                  {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Open' : 'Closed'}
                </button>
              );
            })}
          </div>
        </div>

        {/* List Content */}
        {error && <div className="panel" style={{ color: 'var(--red)', padding: 20, textAlign: 'center' }}>Error loading event list.</div>}
        {isLoading && <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 40 }}>Loading events...</div>}

        {!isLoading && filteredRanks.length === 0 && (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 60 }}>
            No events found.
          </div>
        )}

        <div style={{ display: 'grid', gap: 16 }}>
          {filteredRanks.map(pr => (
            <Link to={`/party-rank/${pr.slug}`} key={pr.slug} style={{ textDecoration: 'none' }}>
              <div 
                className="panel"
                style={{
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pr.name}
                    </h2>
                    {getStatusBadge(pr.status)}
                  </div>
                  {pr.description && (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pr.description}
                    </p>
                  )}
                </div>
                
                <div style={{ color: 'var(--muted)', fontSize: 20 }}>›</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
