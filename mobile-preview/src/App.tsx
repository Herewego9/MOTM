import { useState } from "react";
import { StatusBar } from "./components/StatusBar";
import { TabBar, type TabId } from "./components/TabBar";
import { StemScreen } from "./screens/StemScreen";
import { RanglisteScreen } from "./screens/RanglisteScreen";
import { HoldScreen } from "./screens/HoldScreen";
import { ProfilScreen } from "./screens/ProfilScreen";

export default function App() {
  const [tab, setTab] = useState<TabId>("stem");

  return (
    <div className="stage">
      <div className="stage-label">
        <strong>MOTM</strong> · mobil preview (ingen deploy · mock-data)
      </div>
      <div className="phone" role="presentation">
        <div className="phone-screen">
          <div className="phone-notch" />
          <StatusBar />
          <div className="app-body">
            {tab === "stem" ? <StemScreen /> : null}
            {tab === "rangliste" ? <RanglisteScreen /> : null}
            {tab === "hold" ? <HoldScreen /> : null}
            {tab === "profil" ? <ProfilScreen /> : null}
          </div>
          <TabBar active={tab} onChange={setTab} />
          <div className="home-indicator" />
        </div>
      </div>
    </div>
  );
}
