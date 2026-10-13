// The instant sign-in frame's handshake (R6 shell T13), no React and no wagmi: whether the frame is on screen — so the
// real sheet that replaces it opens with no entrance — and the event the real sheet fires once mounted, which closes it.
let showing = false;

export const SIGN_IN_MOUNTED_EVENT = "cwf:sign-in-mounted";
export const setFrameShowing = (on: boolean): void => {
  showing = on;
};
export const frameShowing = (): boolean => showing;
