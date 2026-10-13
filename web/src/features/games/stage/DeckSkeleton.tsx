// The deal's placeholder (R6 games §4.2.5; From 21st.dev 19988 uiable/card-skeleton, on the states kit's `.skel`): the
// deck strip's five tiles, a card in the settled card's bands (title, line, quote box with its ring, two pills) and the
// UP/DOWN pair — sized 1:1 with the dealt deck, so nothing moves when the cards land.
export function DeckSkeleton() {
  return (
    <div className="dsk" aria-hidden>
      <div className="dsk-strip">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skel dsk-tile" />
        ))}
      </div>
      <div className="dsk-card">
        <span className="skel dsk-title" />
        <span className="skel dsk-line" />
        <span className="skel dsk-quote" />
        <span className="dsk-pills">
          <span className="skel dsk-pill" />
          <span className="skel dsk-pill" />
        </span>
      </div>
      <div className="dsk-calls">
        <span className="skel dsk-call" />
        <span className="skel dsk-call" />
      </div>
    </div>
  );
}
