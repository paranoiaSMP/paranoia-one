/* The two lucide glyphs the blocks use, drawn here (24 grid, 2 stroke) so the
   project does not take a whole icon package for a tick and an arrow. */
const base = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const Check = ({ size = 14 }: { size?: number }) => (
  <svg {...base} width={size} height={size}><path d="M20 6 9 17l-5-5" /></svg>
);

export const UploadGlyph = ({ size = 14 }: { size?: number }) => (
  <svg {...base} width={size} height={size}><path d="M12 3v12" /><path d="m17 8-5-5-5 5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
);
