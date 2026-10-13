// `/u/<address>`'s wait (R4-13a, D-227): one placeholder for the page's Suspense and the route's loading boundary, so a
// navigation shows it once and the record replaces it in place. No inset of its own (R4-10: the stage is the inset).
// R6 (T18, D-230): the record's own outline in its own frame (identity, figures, actions, sections), not one grey bar.
import "./profile.css";
import "@/styles/news.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { profile as profileShape } from "@/components/states/shapes/profile";

export function ProfileLoading() {
  return (
    <div className="container news-page prf-page">
      <LoadingFrame shape="profile" label="Loading the record">{profileShape()}</LoadingFrame>
    </div>
  );
}
