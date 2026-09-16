import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';
import Layout from './components/Layout';
import Home from './pages/Home';
import PartyRankList from './pages/PartyRankList';
import MasterDashboard from './pages/MasterDashboard';
import ParticipantRank from './pages/ParticipantRank';
import PublicResults from './pages/PublicResults';

const App = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sso-callback" element={<AuthenticateWithRedirectCallback />} />
        <Route path="/party-rank" element={<PartyRankList />} />
        <Route path="/party-rank/:slug/master" element={<MasterDashboard />} />
        <Route path="/party-rank/:slug/vote" element={<ParticipantRank />} />
        <Route path="/party-rank/:slug" element={<PublicResults />} />
        <Route path="*" element={<div className="error-view"><h1>404</h1><p>Page Not Found</p></div>} />
      </Routes>
    </Layout>
  );
};

export default App;
