// The token page's shape while it loads (R4-11, D-227): the head row, the 180 px chart, the progress and the action bar.
import "@/styles/launch.css";

export default function Loading() {
  return (
    <section className="lp-page lp-token" aria-busy="true" aria-label="Reading the launch">
      <div className="lp-token-head"><span className="lp-skel lp-skel--disc" /><span className="lp-skel lp-skel--line" /></div>
      <div className="lp-chart lp-skel" />
      <span className="lp-skel lp-skel--line" />
      <div className="lp-action"><span className="lp-skel lp-skel--pill" /><span className="lp-skel lp-skel--pill" /></div>
    </section>
  );
}
