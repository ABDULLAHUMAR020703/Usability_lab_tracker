import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import ResearchList from './pages/ResearchList';
import ResearchEdit from './pages/ResearchEdit';
import ResearchDetail from './pages/ResearchDetail';
import Participants from './pages/Participants';
import ParticipantForm from './pages/ParticipantForm';
import ParticipantDetail from './pages/ParticipantDetail';
import NdaManagement from './pages/NdaManagement';
import NdaSign from './pages/NdaSign';
import ResultsPage from './pages/ResultsPage';
import Analytics from './pages/Analytics';
import SettingsPage from './pages/SettingsPage';
import BackupsPage from './pages/BackupsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="research" element={<ResearchList />} />
        <Route path="research/new" element={<ResearchEdit />} />
        <Route path="research/:id" element={<ResearchDetail />} />
        <Route path="research/:id/edit" element={<ResearchEdit />} />
        <Route path="participants" element={<Participants />} />
        <Route path="participants/new" element={<ParticipantForm />} />
        <Route path="participants/:id" element={<ParticipantDetail />} />
        <Route path="participants/:id/edit" element={<ParticipantForm />} />
        <Route path="ndas" element={<NdaManagement />} />
        <Route path="ndas/:id/sign" element={<NdaSign />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
