/**
 * The essay's sources (the Process page). Every sentence of the essay that states a fact about
 * the world outside the venue carries a mark, `[^key]`, naming the entry here it was checked
 * against; each entry was opened and read for that sentence, never recalled. The findings, with
 * what each source was read for and which could be read only in part, are kept in
 * docs/process-essay.md.
 *
 * References are given as published, in their own language, so one list serves every locale:
 * nothing here is translated. A reference with an address is one a reader can open.
 */
const GENERATOR = 'https://github.com/PredictionExplorer/CS-Image-Generation/blob/main';
const PRINCIPIA =
  'https://en.wikisource.org/wiki/The_Mathematical_Principles_of_Natural_Philosophy_(1729)/Book_1';

export interface Reference {
  text: string;
  href?: string;
}

export const SOURCES = {
  newton: [
    {
      text: 'Newton, I. Philosophiae Naturalis Principia Mathematica (London, 1687), I, Prop. XI–XIII, LVII–LVIII; trans. A. Motte (London, 1729)',
      href: `${PRINCIPIA}/Section_3`,
    },
  ],
  kepler: [
    {
      text: 'Newton, I. Principia (1687), I, Lemma XXVIII, Prop. XXXI',
      href: `${PRINCIPIA}/Section_6`,
    },
    {
      text: 'Fitzpatrick, R. An Introduction to Celestial Mechanics (University of Texas at Austin)',
      href: 'https://farside.ph.utexas.edu/teaching/celestial/Celestial/node33.html',
    },
  ],
  newton3: [
    {
      text: 'Newton, I. Principia (1687), I, Prop. LXV–LXVI; III, Prop. XXII',
      href: `${PRINCIPIA}/Section_11`,
    },
  ],
  euler: [
    {
      text: 'Euler, L. “De motu rectilineo trium corporum se mutuo attrahentium”, Novi Commentarii academiae scientiarum Petropolitanae 11 (1767), 144–151 (E327)',
      href: 'https://scholarlycommons.pacific.edu/euler-works/327/',
    },
    {
      text: 'Euler, L. “Considerationes de motu corporum coelestium”, Novi Commentarii academiae scientiarum Petropolitanae 10 (1766), 544–558 (E304)',
      href: 'https://scholarlycommons.pacific.edu/euler-works/304/',
    },
  ],
  lagrange: [
    {
      text: 'Lagrange, J.-L. “Essai sur le problème des trois corps” (1772), Œuvres de Lagrange 6 (Paris, 1873), 229–331',
      href: 'https://archive.org/details/oeuvresdelagrang06lagr',
    },
  ],
  trojans: [
    {
      text: 'NASA Jet Propulsion Laboratory, Small-Body Database: 588 Achilles',
      href: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=588',
    },
    {
      text: 'IAU Minor Planet Center, List of Jupiter Trojans (2026)',
      href: 'https://www.minorplanetcenter.net/iau/lists/JupiterTrojans.html',
    },
    {
      text: 'Emery, J. P. et al. “The complex history of Trojan asteroids”, Asteroids IV (Tucson, 2015)',
      href: 'https://arxiv.org/abs/1506.01658',
    },
  ],
  webb: [
    {
      text: 'NASA, James Webb Space Telescope: Orbit',
      href: 'https://science.nasa.gov/mission/webb/orbit/',
    },
  ],
  gascheau: [
    {
      text: 'Moeckel, R. “Central configurations”, Scholarpedia 9(4):10667 (2014)',
      href: 'http://www.scholarpedia.org/article/Central_configurations',
    },
    {
      text: 'Chenciner, A. “Three body problem”, Scholarpedia 2(10):2111 (2007)',
      href: 'http://www.scholarpedia.org/article/Three_body_problem',
    },
    { text: 'Gascheau, G. Comptes rendus de l’Académie des sciences 16 (1843), 393–394' },
    {
      text: 'Routh, E. J. “On Laplace’s three particles”, Proceedings of the London Mathematical Society 6 (1875), 86–97',
    },
  ],
  integrable: [
    {
      text: 'Chenciner, A. “Three body problem”, Scholarpedia 2(10):2111 (2007)',
      href: 'http://www.scholarpedia.org/article/Three_body_problem',
    },
    {
      text: 'Tong, D. Dynamics and Relativity (University of Cambridge), ch. 4–5',
      href: 'https://davidtong.org/teaching/dynamics-and-relativity/',
    },
    {
      text: 'Diacu, F. “The solution of the n-body problem”, The Mathematical Intelligencer 18(3) (1996), 66–70',
    },
  ],
  count: [
    {
      text: 'Whittaker, E. T. A Treatise on the Analytical Dynamics of Particles and Rigid Bodies, 2nd ed. (Cambridge, 1917), §§ 155–160',
      href: 'https://archive.org/details/treatisanalytdyn00whitrich',
    },
  ],
  prize: [
    {
      text: 'Mittag-Leffler, G. “Communication sur un prix de mathématiques fondé par le roi Oscar II”, Acta Mathematica 7 (1885), I–VI',
    },
    {
      text: 'Barrow-Green, J. Poincaré and the Three Body Problem (The Open University, 1993)',
      href: 'https://doi.org/10.21954/ou.ro.0000e03b',
    },
    {
      text: 'Walter, S. A. (ed.) Henri Poincaré Papers: Mittag-Leffler, 1889–1890',
      href: 'https://henripoincarepapers.univ-nantes.fr/chp/text/mittag-leffler100.html',
    },
  ],
  tangle: [
    {
      text: 'Poincaré, H. Les Méthodes nouvelles de la mécanique céleste 3 (Paris, 1899), n° 397',
      href: 'https://archive.org/details/lesmthodesnouv003poin',
    },
  ],
  chaos: [
    {
      text: 'Barrow-Green, J. Poincaré and the Three Body Problem (The Open University, 1993), 153',
      href: 'https://doi.org/10.21954/ou.ro.0000e03b',
    },
    {
      text: 'Poincaré, H. “Sur le problème des trois corps et les équations de la dynamique”, Acta Mathematica 13 (1890), 226–227',
    },
  ],
  bruns: [
    {
      text: 'Bruns, H. “Über die Integrale des Vielkörper-Problems”, Acta Mathematica 11 (1887), 25–96',
      href: 'https://doi.org/10.1007/BF02612319',
    },
    {
      text: 'Julliard-Tosel, E. “Bruns’ theorem: the proof and some generalizations”, Celestial Mechanics and Dynamical Astronomy 76 (2000), 241–281',
    },
  ],
  poincare1890: [
    {
      text: 'Poincaré, H. “Sur le problème des trois corps et les équations de la dynamique”, Acta Mathematica 13 (1890), 1–270, § 22',
    },
    { text: 'Whittaker, E. T. Analytical Dynamics, 2nd ed. (Cambridge, 1917), § 165' },
  ],
  sundman: [
    {
      text: 'Sundman, K. F. “Mémoire sur le problème des trois corps”, Acta Mathematica 36 (1912), 105–179',
      href: 'https://doi.org/10.1007/BF02422379',
    },
  ],
  beloriszky: [
    {
      text: 'Belorizky, D. “Application pratique des méthodes de M. Sundman à un cas particulier du problème des trois corps”, Bulletin Astronomique (2) 6 (1930), 417–434',
    },
    {
      text: 'Barrow-Green, J. “The dramatic episode of Sundman”, Historia Mathematica 37 (2010), 164–203',
      href: 'https://doi.org/10.1016/j.hm.2009.12.004',
    },
  ],
  poincare1908: [
    {
      text: 'Poincaré, H. Science et méthode (Paris, 1908), I, ch. IV',
      href: 'https://fr.wikisource.org/wiki/Science_et_m%C3%A9thode/Livre_premier,_%C2%A7_IV',
    },
  ],
  horizon: [
    {
      text: 'Boffetta, G., Cencini, M., Falcioni, M., Vulpiani, A. “Predictability: a way to characterize complexity”, Physics Reports 356 (2002), 367–474, § 2.1.1',
      href: 'https://arxiv.org/abs/nlin/0101029',
    },
  ],
  laskar: [
    {
      text: 'Laskar, J. “Is the Solar System stable?”, Progress in Mathematical Physics 66 (2013), 239–270, § 2.1',
      href: 'https://arxiv.org/abs/1209.5996',
    },
  ],
  'generator-labels': [
    {
      text: 'CS-Image-Generation, src/traits_analysis.rs',
      href: `${GENERATOR}/src/traits_analysis.rs`,
    },
  ],
  'generator-sim': [
    { text: 'CS-Image-Generation, src/sim.rs', href: `${GENERATOR}/src/sim.rs` },
    { text: 'CS-Image-Generation, src/app.rs', href: `${GENERATOR}/src/app.rs` },
  ],
  standish: [
    {
      text: 'Standish, E. M. “Sufficient conditions for escape in the three-body problem”, Celestial Mechanics 4 (1971), 44–48',
      href: 'https://doi.org/10.1007/BF01230319',
    },
    {
      text: 'Bozis, G. “Regions of escape on the velocity ellipsoid for the planar three body problem”, Dynamics of Planets and Satellites and Theories of Their Motion (Dordrecht, 1978), 357–369',
    },
  ],
  leapfrog: [
    {
      text: 'Hairer, E., Lubich, C., Wanner, G. “Geometric numerical integration illustrated by the Störmer–Verlet method”, Acta Numerica 12 (2003), 399–450, § 1.3',
      href: 'https://doi.org/10.1017/S0962492902000144',
    },
    { text: 'Newton, I. Principia (1687), I, Prop. I' },
  ],
  yoshida: [
    {
      text: 'Yoshida, H. “Construction of higher order symplectic integrators”, Physics Letters A 150 (1990), 262–268',
      href: 'https://doi.org/10.1016/0375-9601(90)90092-3',
    },
    {
      text: 'Forest, E., Ruth, R. D. “Fourth-order symplectic integration”, Physica D 43 (1990), 105–117',
      href: 'https://doi.org/10.1016/0167-2789(90)90019-L',
    },
  ],
  symplectic: [
    {
      text: 'Hairer, E., Lubich, C., Wanner, G. Acta Numerica 12 (2003), 399–450, Theorem 5.1',
      href: 'https://doi.org/10.1017/S0962492902000144',
    },
    {
      text: 'Gauckler, L., Hairer, E., Lubich, C. “Dynamics, numerical analysis, and some geometry”, Proceedings of the International Congress of Mathematicians 2018, 453–485',
      href: 'https://arxiv.org/abs/1710.03946',
    },
  ],
  chambers: [
    {
      text: 'Chambers, J. E. “A hybrid symplectic integrator that permits close encounters between massive bodies”, Monthly Notices of the Royal Astronomical Society 304 (1999), 793–799',
      href: 'https://doi.org/10.1046/j.1365-8711.1999.02379.x',
    },
  ],
  ieee: [
    {
      text: 'Goldberg, D. “What every computer scientist should know about floating-point arithmetic”, ACM Computing Surveys 23 (1991), 5–48',
      href: 'https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html',
    },
    {
      text: 'Ecma International, ECMAScript Language Specification, §§ 6.1.6.1, 21.3.2.33',
      href: 'https://tc39.es/ecma262/',
    },
  ],
  borda: [
    {
      text: 'Borda, J.-C. de “Mémoire sur les élections au scrutin”, Histoire de l’Académie royale des sciences, année 1781 (Paris, 1784), 657–665',
      href: 'https://archive.org/details/histoiredelacad81hist',
    },
    {
      text: 'Pacuit, E. “Voting methods”, Stanford Encyclopedia of Philosophy (2019)',
      href: 'https://plato.stanford.edu/entries/voting-methods/',
    },
  ],
  'navier-stokes': [
    {
      text: 'Navier, C.-L. “Mémoire sur les lois du mouvement des fluides”, Mémoires de l’Académie royale des sciences de l’Institut de France 6 (1827), 389–440',
    },
    {
      text: 'Stokes, G. G. “On the theories of the internal friction of fluids in motion, and of the equilibrium and motion of elastic solids”, Transactions of the Cambridge Philosophical Society 8 (1849), 287–319',
    },
  ],
  reynolds: [
    {
      text: 'Reynolds, O. “An experimental investigation of the circumstances which determine whether the motion of water shall be direct or sinuous, and of the law of resistance in parallel channels”, Philosophical Transactions of the Royal Society of London 174 (1883), 935–982',
      href: 'https://doi.org/10.1098/rstl.1883.0029',
    },
  ],
  ember: [
    {
      text: 'CS-Image-Generation, docs/ember-design.md, §§ 3–6',
      href: `${GENERATOR}/docs/ember-design.md`,
    },
    {
      text: 'CS-Image-Generation, docs/ember-edition.md',
      href: `${GENERATOR}/docs/ember-edition.md`,
    },
  ],
  wake: [
    {
      text: 'Taira, K. et al. “Modal analysis of fluid flows: applications and outlook”, AIAA Journal 58 (2020), 998–1022',
      href: 'https://arxiv.org/abs/1903.05750',
    },
  ],
  fefferman: [
    {
      text: 'Fefferman, C. L. “Existence and smoothness of the Navier–Stokes equation” (Clay Mathematics Institute)',
      href: 'https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf',
    },
    {
      text: 'Clay Mathematics Institute, The Millennium Prize Problems',
      href: 'https://www.claymath.org/millennium-problems/',
    },
  ],
  bas: [
    {
      text: 'Boyland, P. L., Aref, H., Stremler, M. A. “Topological fluid mechanics of stirring”, Journal of Fluid Mechanics 403 (2000), 277–304',
      href: 'https://doi.org/10.1017/S0022112099007107',
    },
  ],
  mixing: [
    {
      text: 'Aref, H. et al. “Frontiers of chaotic advection”, Reviews of Modern Physics 89 (2017), 025007',
      href: 'https://arxiv.org/abs/1403.2953',
    },
    {
      text: 'Villermaux, E. “Mixing versus stirring”, Annual Review of Fluid Mechanics 51 (2019), 245–273',
      href: 'https://doi.org/10.1146/annurev-fluid-010518-040306',
    },
  ],
  ejection: [
    {
      text: 'Stone, N. C., Leigh, N. W. C. “A statistical solution to the chaotic, non-hierarchical three-body problem”, Nature 576 (2019), 406–410',
      href: 'https://arxiv.org/abs/1909.05272',
    },
    { text: 'Valtonen, M., Karttunen, H. The Three-Body Problem (Cambridge, 2006), ch. 7' },
  ],
} as const satisfies Record<string, readonly Reference[]>;

export type SourceKey = keyof typeof SOURCES;

/** A source mark as the essay's words carry it: `[^newton]`. */
export const SOURCE_MARK = /\[\^([\w-]+)\]/g;

export const isSource = (key: string): key is SourceKey => Object.hasOwn(SOURCES, key);

/**
 * The sources in the order a reader first meets them: the numerals the text shows. `texts` are
 * the essay's strings in reading order; the English is handed in for every locale, so a numeral
 * names the same source whatever the language.
 */
export function sourceOrder(texts: readonly string[]): SourceKey[] {
  const order: SourceKey[] = [];
  for (const text of texts)
    for (const [, key] of text.matchAll(SOURCE_MARK)) {
      if (!isSource(key)) throw new Error(`The essay cites a source it does not list: ${key}`);
      if (!order.includes(key)) order.push(key);
    }
  return order;
}
