/**
 * Strategic Chess Server-Authoritative Elo Rating Calculation Module
 * Implements standard FIDE-compliant Elo rating algorithm.
 */

export const DEFAULT_STARTING_RATING = 1200;
export const DEFAULT_K_FACTOR = 32;
export const MINIMUM_RATING = 100;

/**
 * Calculate expected score for player A against player B
 * E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 */
export function getExpectedScore(ratingA, ratingB) {
  const diff = (ratingB - ratingA) / 400;
  return 1 / (1 + Math.pow(10, diff));
}

/**
 * Calculate Elo rating changes for a completed chess match.
 *
 * @param {Object} params
 * @param {number|null} params.whiteRating - Pre-match White player rating
 * @param {number|null} params.blackRating - Pre-match Black player rating
 * @param {string} params.result - Match result ('white_win', 'black_win', 'draw', 'stalemate')
 * @param {number} [params.kFactor=32] - K-factor (sensitivity)
 * @returns {Object} { whiteDelta, blackDelta, whiteNewRating, blackNewRating, whiteExpected, blackExpected }
 */
export function calculateEloChanges({
  whiteRating = DEFAULT_STARTING_RATING,
  blackRating = DEFAULT_STARTING_RATING,
  result,
  kFactor = DEFAULT_K_FACTOR
}) {
  const rWhite = typeof whiteRating === 'number' && !isNaN(whiteRating)
    ? whiteRating
    : DEFAULT_STARTING_RATING;

  const rBlack = typeof blackRating === 'number' && !isNaN(blackRating)
    ? blackRating
    : DEFAULT_STARTING_RATING;

  const expectedWhite = getExpectedScore(rWhite, rBlack);
  const expectedBlack = 1 - expectedWhite;

  let actualWhite;
  let actualBlack;

  switch (result) {
    case 'white_win':
      actualWhite = 1.0;
      actualBlack = 0.0;
      break;
    case 'black_win':
      actualWhite = 0.0;
      actualBlack = 1.0;
      break;
    case 'draw':
    case 'stalemate':
      actualWhite = 0.5;
      actualBlack = 0.5;
      break;
    default:
      // Aborted or invalid results produce zero rating changes
      return {
        whiteDelta: 0,
        blackDelta: 0,
        whiteNewRating: rWhite,
        blackNewRating: rBlack,
        whiteExpected: expectedWhite,
        blackExpected: expectedBlack
      };
  }

  // Calculate rating changes
  let whiteDelta = Math.round(kFactor * (actualWhite - expectedWhite));
  let blackDelta = -whiteDelta; // Symmetrical conservation of rating points

  // Ensure minimum floor of 100 ELO
  const whiteNewRating = Math.max(MINIMUM_RATING, rWhite + whiteDelta);
  const blackNewRating = Math.max(MINIMUM_RATING, rBlack + blackDelta);

  // Recalculate actual deltas if clamped
  whiteDelta = whiteNewRating - rWhite;
  blackDelta = blackNewRating - rBlack;

  return {
    whiteDelta,
    blackDelta,
    whiteNewRating,
    blackNewRating,
    whiteExpected: Math.round(expectedWhite * 1000) / 1000,
    blackExpected: Math.round(expectedBlack * 1000) / 1000
  };
}
