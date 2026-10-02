// Web preview has no native video surfaces or activity window.
export function CallxVideoView(_props: {callId: string; source?: 'local' | 'remote'; mirror?: boolean; style?: object}) { return null; }
export function configurePictureInPicture(_options: {automatic: boolean}): void {}
export async function enterPictureInPicture(): Promise<boolean> { return false; }
export function addPictureInPictureListener(_listener: (inPiP: boolean) => void): () => void { return () => {}; }
