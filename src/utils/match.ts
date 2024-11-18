/**
 * 두 문자열 간의 가중치가 적용된 레벤슈타인 거리를 계산합니다.
 * 레벤슈타인 거리는 한 문자열을 다른 문자열로 변환하는데 필요한 최소 편집 비용입니다.
 * 
 * @param str1 첫 번째 문자열
 * @param str2 두 번째 문자열
 * @param options 가중치 옵션
 * 
 * @returns 두 문자열 간의 가중치가 적용된 레벤슈타인 거리
 */
export function weightedLevenshteinDistance(
  str1: string,
  str2: string,
  options: {
    deleteCost: number;
    insertCost: number;
    substituteCost: number;
  } = {
    deleteCost: 1,
    insertCost: 1,
    substituteCost: 1,
  }
): number {
  const { deleteCost, insertCost, substituteCost } = options;
  // 완성형 한글을 모두 자소로 분리
  str1 = splitKorean(str1).join("");
  str2 = splitKorean(str2).join("");

  const m = str1.length;
  const n = str2.length;
  
  // 빈 문자열 처리
  if (m === 0) return n * insertCost;
  if (n === 0) return m * deleteCost;

  // 2차원 배열 초기화
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // 첫 행과 열 초기화
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i * deleteCost;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j * insertCost;
  }

  // 동적 프로그래밍으로 최소 편집 거리 계산
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + deleteCost,     // 삭제
          dp[i][j - 1] + insertCost,     // 삽입
          dp[i - 1][j - 1] + substituteCost  // 대체
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 두 문자열 간의 유사도를 0과 1 사이의 비율로 계산합니다.
 * 1은 완전히 동일함을 의미하고, 0은 완전히 다름을 의미합니다.
 * 
 * @param str1 첫 번째 문자열
 * @param str2 두 번째 문자열
 * @param options 가중치 옵션
 * 
 * @returns 두 문자열 간의 유사도 비율
 */
export function weightedLevenshteinRatio(
  str1: string,
  str2: string,
  options: {
    deleteCost: number;
    insertCost: number;
    substituteCost: number;
  } = {
    deleteCost: 0.5,
    insertCost: 0.5,
    substituteCost: 1,
  }
): number {
  const distance = weightedLevenshteinDistance(str1, str2, options);
  const maxLen = Math.max(str1.length, str2.length);

  // 유사도 비율 계산
  return maxLen === 0 ? 1 : 1 - distance / (maxLen * Math.max(options.deleteCost, options.insertCost, options.substituteCost));
}

// 한글 자소를 모두 분리
function splitKorean(str: string): string[] {
  const initialConsonants = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ',
    'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ',
    'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
  ];

  const vowels = [
    'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ',
    'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ',
    'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ',
    'ㅡ', 'ㅢ', 'ㅣ'
  ];

  const finalConsonants = [
    '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ',
    'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ',
    'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ',
    'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ',
    'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
  ];

  const result: string[] = [];

  for (const char of str) {
    const code = char.charCodeAt(0);

    if (code >= 0xac00 && code <= 0xd7a3) {
      // 한글 음절 분리
      const syllableIndex = code - 0xac00;
      const initialIndex = Math.floor(syllableIndex / (21 * 28));
      const vowelIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
      const finalIndex = syllableIndex % 28;

      result.push(initialConsonants[initialIndex]);
      result.push(vowels[vowelIndex]);
      if (finalIndex !== 0) {
        result.push(finalConsonants[finalIndex]);
      }
    } else {
      // 한글이 아닌 문자는 그대로 추가
      result.push(char);
    }
  }

  return result;
}