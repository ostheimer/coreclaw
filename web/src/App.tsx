import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Inbox } from "./pages/Inbox";
import { Drafts } from "./pages/Drafts";
import { Notes } from "./pages/Notes";
import { Activity } from "./pages/Activity";
import { Settings } from "./pages/Settings";
import { useWebSocket } from "./hooks/useWebSocket";

export default function App() {
  const { connected, events } = useWebSocket();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout connected={connected} />}>
          <Route index element={<Dashboard />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="drafts" element={<Drafts />} />
          <Route path="notes" element={<Notes />} />
          <Route path="activity" element={<Activity events={events} />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
