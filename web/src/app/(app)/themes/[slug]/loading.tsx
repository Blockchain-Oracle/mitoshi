// The theme page's shape while it loads (R4-11, D-227): the head, the Follow pill, the tabs' first panel.
import "@/styles/themes.css";
import "@/styles/launch.css";

export default function Loading() {
  return (
    <section className="th-page th-cockpit" aria-busy="true" aria-label="Reading the theme">
      <div className="th-cockpit-head"><span className="lp-skel lp-skel--disc" /><span className="lp-skel lp-skel--line" /></div>
      <span className="lp-skel lp-skel--pill" />
      <div className="lp-chart lp-skel" />
    </section>
  );
}
