import { useState } from "react";
import { StatusBar } from "./components/StatusBar";
import { TabBar, type TabId } from "./components/TabBar";
import { StemScreen } from "./screens/StemScreen";
import { RanglisteScreen } from "./screens/RanglisteScreen";
import { HoldScreen } from "./screens/HoldScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { ProfilScreen } from "./screens/ProfilScreen";
import { StoreProvider } from "./store";

export default function App() {
  const [tab, setTab] = useState<TabId>("stem");

  return (
    <StoreProvider>
      <div className="stage">
        <div className="stage-label">
          <strong>MOTM</strong> · mobil preview — tilføj kampprogram under <strong>Kampe</strong>
        </div>
        <div className="phone" role="presentation">
          <div className="phone-screen">
            <div className="phone-notch" />
            <StatusBar />
            <div className="app-body">
              {tab === "stem" ? <StemScreen /> : null}
              {tab === "rangliste" ? <RanglisteScreen /> : null}
              {tab === "hold" ? <HoldScreen /> : null}
              {tab === "kampe" ? <AdminScreen /> : null}
              {tab === "profil" ? <ProfilScreen /> : null}
            </div>
            <TabBar active={tab} onChange={setTab} />
            <div className="home-indicator" />
          </div>
        </div>
      </div>
    </StoreProvider>
  );
}
