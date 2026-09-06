import animate from 'tailwindcss-animate';

/* Tailwind, alongside the stylesheet rather than instead of it.
 *
 * Stage two of ADR 0010. The existing 1,425 lines of semantic CSS keep working
 * untouched; this is for components copied in from shadcn, which are written
 * in utilities and cannot be dressed any other way.
 *
 * Two settings make the coexistence safe, and they are the whole reason this
 * can be added without a rewrite.
 *
 * preflight is off. Tailwind's reset is opinionated and global — it strips
 * heading sizes, list markers and button styling from the entire document, and
 * would land on top of a stylesheet that has been assuming the defaults for
 * months. With it off, Tailwind contributes only the utility classes actually
 * used, and adding it changes the look of nothing that existed yesterday.
 *
 * There is no prefix, which was checked rather than hoped: the 204 class names
 * this project defines were compared against the utility names Tailwind
 * generates and none collide. That matters because a prefix would have to be
 * applied by hand to every component shadcn publishes, on every copy, for ever.
 *
 * The colours are the aliases from stage one. Nothing here re-picks a shade:
 * every one resolves to the same triplet the studio has always painted with,
 * so a shadcn button and a hand-written one are the same gold.
 */

/** @type {import('tailwindcss').Config} */
export default {
  /* Only where utilities are written, which is inside components copied
   * from shadcn.
   *
   * Pointed at the whole of src/ first, and the scanner did what it is
   * built to do: it pulls candidate class names out of any text it is
   * given, prose in comments included. A codebase that says "hidden
   * rather than unmounted" in a comment got a real .hidden{display:none}
   * rule in its stylesheet, along with .block, .table, .grid, .fixed and
   * a few dozen more. Nothing broke — that was checked, not assumed —
   * but it is four kilobytes of rules nobody asked for and a standing
   * chance that some future element carrying className="hidden" as a
   * hook quietly disappears.
   *
   * The narrow glob also enforces the rule it describes: a utility class
   * written anywhere else does not exist, so it does nothing, which is
   * noticed immediately rather than becoming a habit. */
  content: ['./src/ui/shad/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--ui-background))',
        foreground: 'hsl(var(--ui-foreground))',
        border: 'hsl(var(--ui-border))',
        input: 'hsl(var(--ui-input))',
        ring: 'hsl(var(--ui-ring))',
        card: {
          DEFAULT: 'hsl(var(--ui-card))',
          foreground: 'hsl(var(--ui-card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--ui-popover))',
          foreground: 'hsl(var(--ui-popover-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--ui-secondary))',
          foreground: 'hsl(var(--ui-secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--ui-muted))',
          foreground: 'hsl(var(--ui-muted-foreground))',
        },
        /* The accent is a light gold and the warning a light red, so what goes
         * on top of either is the dark ground rather than the ink. */
        primary: {
          DEFAULT: 'hsl(var(--ui-primary))',
          foreground: 'hsl(var(--ui-background))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--ui-destructive))',
          foreground: 'hsl(var(--ui-background))',
        },
      },
      fontFamily: {
        sans: ['var(--sans)'],
        mono: ['var(--mono)'],
      },
      /* Matching the radii already in the stylesheet, so a copied component
       * does not arrive rounder than everything around it. */
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
      },
    },
  },
  plugins: [animate],
};
