/*
  The rhythms the orbit section's performances share: the recorded window (orbit-window.ts),
  After the frame (orbit-beyond.ts) and one part in a trillion (orbit-twin.tsx).
*/

/**
 * A performance says where it stands this often at most, in milliseconds: four times a second.
 * The line changes no faster than it can be read, and the section is drawn again no more often
 * for it.
 */
export const SAID_EVERY_MS = 250;

/**
 * No frame carries a performance past the frame farther than this, in seconds, so a tab coming
 * back resumes it where it was. The recorded window keeps the film's own clock instead: a frame
 * that comes late finds it where the film would be.
 */
export const LONGEST_FRAME_SECONDS = 0.1;
